import crypto from 'crypto';
import path from 'path';
import Document from '../model/document.model';
import Project from '../model/project.model';
import Extraction from '../model/extraction.model';
import ExtractionJob from '../model/extractionJob.model';
import { v4 as uuidv4 } from 'uuid';
import {
  buildObjectKey,
  deleteEncryptedObject,
  getEncryptedObject,
  putEncryptedObject,
} from '../utils/blob-storage.util';
import { assertUserInOrganisation, assertOrgRole } from '../utils/org-access.util';
import {
  COMMON_PROJECT_FOLDER,
  visibilityFilter,
} from '../utils/visibility.util';
import jobService from './job.service';
import quotaService from './quota.service';
import auditService from './audit.service';
import demoService from './demo.service';
import {
  decryptBuffer,
  encryptBuffer,
} from '../utils/envelope-encryption.util';
import {
  DEFAULT_RETENTION_DAYS,
  MIN_RETENTION_DAYS,
} from '../constants/plans';

const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
  'image/gif',
  'image/bmp',
  'image/tiff',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/csv',
  'application/csv',
  'text/plain',
  'text/markdown',
]);

const ALLOWED_EXTENSIONS = new Set([
  'pdf',
  'png',
  'jpg',
  'jpeg',
  'webp',
  'gif',
  'bmp',
  'tif',
  'tiff',
  'doc',
  'docx',
  'xls',
  'xlsx',
  'csv',
  'txt',
  'md',
]);

const MAX_FILE_SIZE = 20 * 1024 * 1024;

function toListItem(doc: any) {
  return {
    documentId: doc.documentId,
    projectId: doc.projectId ?? null,
    originalFilename: doc.originalFilename,
    displayTitle: doc.displayTitle || null,
    mimeType: doc.mimeType,
    size: doc.size,
    status: doc.status,
    contentHash: doc.contentHash,
    uploadedBy: doc.uploadedBy,
    sharedWithOrganisation: doc.sharedWithOrganisation !== false,
    filePurgedAt: doc.filePurgedAt || null,
    retentionDays: doc.retentionDays ?? null,
    keepForever: Boolean(doc.keepForever),
    fileExpiresAt: doc.fileExpiresAt || null,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

function resolveRetention(params: {
  retentionDays?: number | null;
  keepForever?: boolean;
}): { retentionDays: number | null; keepForever: boolean; fileExpiresAt: Date | null } {
  if (params.keepForever) {
    return { retentionDays: null, keepForever: true, fileExpiresAt: null };
  }
  let days =
    typeof params.retentionDays === 'number' && !Number.isNaN(params.retentionDays)
      ? Math.floor(params.retentionDays)
      : DEFAULT_RETENTION_DAYS;
  if (days < MIN_RETENTION_DAYS) {
    throw new Error(
      `File retention must be at least ${MIN_RETENTION_DAYS} days (or keep forever)`
    );
  }
  const fileExpiresAt = new Date();
  fileExpiresAt.setUTCDate(fileExpiresAt.getUTCDate() + days);
  return { retentionDays: days, keepForever: false, fileExpiresAt };
}

export class DocumentService {
  public async uploadDocument(params: {
    userId: string;
    organisationId: string;
    projectId?: string | null;
    originalFilename: string;
    mimeType: string;
    buffer: Buffer;
    consentGivenAt?: Date | null;
    sharedWithOrganisation?: boolean;
    retentionDays?: number | null;
    keepForever?: boolean;
  }) {
    const {
      userId,
      organisationId,
      originalFilename,
      buffer,
      consentGivenAt,
    } = params;
    const retention = resolveRetention({
      retentionDays: params.retentionDays,
      keepForever: params.keepForever,
    });
    let mimeType = params.mimeType;

    const projectId =
      params.projectId && String(params.projectId).trim()
        ? String(params.projectId).trim()
        : null;

    await assertUserInOrganisation(userId, organisationId);
    await quotaService.assertUploadAllowed(organisationId, buffer.length);

    const demoTrf = await demoService.isDemoTrfProject(organisationId, projectId);
    if (!demoTrf) {
      await quotaService.assertExtractionAllowed(organisationId);
    }

    const ext = path.extname(originalFilename || '').replace(/^\./, '').toLowerCase();
    if (!ALLOWED_MIME_TYPES.has(mimeType) && !ALLOWED_EXTENSIONS.has(ext)) {
      throw new Error(
        'Unsupported file type. Allowed: PDF, images (PNG/JPG/WEBP), Word, Excel, CSV, TXT'
      );
    }
    // Normalize empty browser MIME from extension when possible
    if ((!mimeType || mimeType === 'application/octet-stream') && ext) {
      const byExt: Record<string, string> = {
        pdf: 'application/pdf',
        png: 'image/png',
        jpg: 'image/jpeg',
        jpeg: 'image/jpeg',
        webp: 'image/webp',
        docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        csv: 'text/csv',
        txt: 'text/plain',
      };
      if (byExt[ext]) {
        mimeType = byExt[ext];
      }
    }

    if (buffer.length > MAX_FILE_SIZE) {
      throw new Error('File too large (max 20MB)');
    }

    let sharedWithOrganisation =
      typeof params.sharedWithOrganisation === 'boolean'
        ? params.sharedWithOrganisation
        : projectId
          ? true
          : false;

    if (projectId) {
      const project = await Project.findOne({
        projectId,
        organisationId,
        deletedAt: null,
        status: 'active',
        ...visibilityFilter(userId, 'createdBy'),
      }).lean();

      if (!project) {
        throw new Error('Project not found');
      }

      // Private project uploads stay private unless explicitly shared
      if (project.sharedWithOrganisation === false) {
        sharedWithOrganisation = false;
      } else if (typeof params.sharedWithOrganisation !== 'boolean') {
        sharedWithOrganisation = true;
      }
    }

    const documentId = uuidv4();
    const extension = path.extname(originalFilename) || '.pdf';
    const objectKey = buildObjectKey(
      organisationId,
      projectId || COMMON_PROJECT_FOLDER,
      documentId,
      `${extension}.enc`
    );

    const contentHash = crypto
      .createHash('sha256')
      .update(buffer)
      .digest('hex');

    const envelope = encryptBuffer(buffer, organisationId);
    const stored = await putEncryptedObject(objectKey, envelope.ciphertext);

    const document = await Document.create({
      documentId,
      organisationId,
      projectId,
      originalFilename,
      mimeType,
      size: buffer.length,
      storagePath: stored.storagePath,
      storageUri: stored.storageUri,
      storageProvider: stored.storageProvider,
      contentHash,
      isEncrypted: true,
      encryption: {
        iv: envelope.iv,
        authTag: envelope.authTag,
        encryptedDEK: envelope.encryptedDEK,
        dekIv: envelope.dekIv,
        dekAuthTag: envelope.dekAuthTag,
      },
      status: 'queued',
      uploadedBy: userId,
      sharedWithOrganisation,
      consentGivenAt: consentGivenAt ?? null,
      retentionDays: retention.retentionDays,
      keepForever: retention.keepForever,
      fileExpiresAt: retention.fileExpiresAt,
    });

    await quotaService.incrementUploadCount(organisationId);

    await auditService.logEvent({
      actorId: userId,
      organisationId,
      action: 'document.upload',
      resourceType: 'document',
      resourceId: documentId,
      metadata: {
        projectId,
        originalFilename,
        mimeType,
        size: buffer.length,
        sharedWithOrganisation,
        consentGivenAt: consentGivenAt ?? null,
        storageProvider: stored.storageProvider,
        retentionDays: retention.retentionDays,
        keepForever: retention.keepForever,
        fileExpiresAt: retention.fileExpiresAt,
      },
    });

    const job = await jobService.createJob({
      documentId,
      organisationId,
      projectId,
    });

    if (projectId) {
      try {
        const { coerceProjectWebhooks, dispatchProjectWebhooks } = await import(
          './webhook.service'
        );
        const project = await Project.findOne({
          projectId,
          organisationId,
          deletedAt: null,
        }).lean();
        await dispatchProjectWebhooks(coerceProjectWebhooks(project || {}), {
          event: 'document.uploaded',
          projectId,
          documentId,
          jobId: job.jobId,
          organisationId,
          status: job.status,
          originalFilename,
          displayTitle: null,
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        console.warn('[webhook] document.uploaded dispatch failed', error);
      }
    }

    return {
      documentId: document.documentId,
      jobId: job.jobId,
      status: job.status,
      projectId,
      sharedWithOrganisation,
      message: 'File uploaded. Extraction queued.',
    };
  }

  public async listDocuments(
    userId: string,
    organisationId: string,
    projectId: string
  ) {
    await assertUserInOrganisation(userId, organisationId);

    // Ensure the project itself is visible to this user
    const project = await Project.findOne({
      projectId,
      organisationId,
      deletedAt: null,
      ...visibilityFilter(userId, 'createdBy'),
    }).lean();

    if (!project) {
      throw new Error('Project not found');
    }

    const documents = await Document.find({
      organisationId,
      projectId,
      deletedAt: null,
      ...visibilityFilter(userId, 'uploadedBy'),
    })
      .sort({ createdAt: -1 })
      .lean();

    return documents.map(toListItem);
  }

  public async getDocument(
    userId: string,
    organisationId: string,
    documentId: string
  ) {
    await assertUserInOrganisation(userId, organisationId);

    let document = await Document.findOne({
      documentId,
      organisationId,
      deletedAt: null,
      ...visibilityFilter(userId, 'uploadedBy'),
    }).lean();

    if (!document) {
      throw new Error('Document not found');
    }

    let latestJob = await ExtractionJob.findOne({ documentId })
      .sort({ createdAt: -1 })
      .lean();

    if (latestJob) {
      await demoService.rescueStuckDemoJob(latestJob as any);
      await demoService.finalizeDemoJobIfDue(latestJob as any);
      latestJob = await ExtractionJob.findOne({ documentId })
        .sort({ createdAt: -1 })
        .lean();
      const refreshed = await Document.findOne({
        documentId,
        organisationId,
        deletedAt: null,
      }).lean();
      if (refreshed) document = refreshed;
    }

    const extraction = await Extraction.findOne({ documentId })
      .sort({ version: -1 })
      .lean();

    return {
      document: {
        documentId: document.documentId,
        projectId: document.projectId ?? null,
        originalFilename: document.originalFilename,
        displayTitle: document.displayTitle || null,
        mimeType: document.mimeType,
        size: document.size,
        status: document.status,
        contentHash: document.contentHash,
        uploadedBy: document.uploadedBy,
        sharedWithOrganisation: document.sharedWithOrganisation !== false,
        filePurgedAt: document.filePurgedAt || null,
        retentionDays: document.retentionDays ?? null,
        keepForever: Boolean(document.keepForever),
        fileExpiresAt: document.fileExpiresAt || null,
        createdAt: document.createdAt,
        updatedAt: document.updatedAt,
      },
      job: latestJob
        ? {
            jobId: latestJob.jobId,
            status: latestJob.status,
            error: latestJob.error,
            completedAt: latestJob.completedAt,
            demoMode: Boolean((latestJob as { demoMode?: boolean }).demoMode),
            demoRevealAt: (() => {
              const raw = (latestJob as { demoRevealAt?: Date | string | null })
                .demoRevealAt;
              if (!raw) return null;
              return raw instanceof Date ? raw.toISOString() : String(raw);
            })(),
          }
        : null,
      extraction: extraction
        ? {
            extractionId: extraction.extractionId,
            jobId: extraction.jobId,
            data: extraction.data,
            fieldConfidence: extraction.fieldConfidence,
            validationErrors: extraction.validationErrors,
            status: extraction.status,
            strategy: (extraction as any).strategy,
            version: extraction.version,
            approvedAt: extraction.approvedAt,
          }
        : null,
    };
  }

  public async getDocumentFile(
    userId: string,
    organisationId: string,
    documentId: string
  ) {
    await assertUserInOrganisation(userId, organisationId);

    const document = await Document.findOne({
      documentId,
      organisationId,
      deletedAt: null,
      ...visibilityFilter(userId, 'uploadedBy'),
    }).lean();

    if (!document) {
      throw new Error('Document not found');
    }

    if (document.filePurgedAt || !document.storagePath) {
      throw new Error(
        'Original file was removed from storage; extracted context is still available'
      );
    }

    const encryptedBytes = await getEncryptedObject({
      storagePath: document.storagePath,
      storageUri: document.storageUri,
      storageProvider: document.storageProvider,
    });

    if (!document.isEncrypted || !document.encryption) {
      return {
        buffer: encryptedBytes,
        mimeType: document.mimeType,
        filename: document.originalFilename,
      };
    }

    const plaintext = decryptBuffer(
      {
        ciphertext: encryptedBytes,
        iv: document.encryption.iv,
        authTag: document.encryption.authTag,
        encryptedDEK: document.encryption.encryptedDEK,
        dekIv: document.encryption.dekIv,
        dekAuthTag: document.encryption.dekAuthTag,
      },
      organisationId
    );

    return {
      buffer: plaintext,
      mimeType: document.mimeType,
      filename: document.originalFilename,
    };
  }

  public async deleteDocument(
    userId: string,
    organisationId: string,
    documentId: string
  ) {
    await assertUserInOrganisation(userId, organisationId);

    const document = await Document.findOne({
      documentId,
      organisationId,
      deletedAt: null,
      ...visibilityFilter(userId, 'uploadedBy'),
    });

    if (!document) {
      throw new Error('Document not found');
    }

    const isOwner = document.uploadedBy === userId;
    if (!isOwner) {
      await assertOrgRole(userId, organisationId, 'admin');
    }

    // Purge original binary from storage, but keep extraction + RAG context
    if (!document.filePurgedAt && document.storagePath) {
      try {
        await deleteEncryptedObject({
          storagePath: document.storagePath,
          storageUri: document.storageUri,
          storageProvider: document.storageProvider,
        });
      } catch {
        // Object may already be missing
      }
    }

    document.deletedAt = new Date();
    document.filePurgedAt = document.filePurgedAt || new Date();
    document.size = 0;
    document.storagePath = '';
    document.storageUri = null;
    document.encryption = null;
    document.isEncrypted = false;
    // Keep completed status so context remains meaningful in audits
    if (document.status !== 'completed' && document.status !== 'failed') {
      document.status = 'completed';
    }
    await document.save();

    await auditService.logEvent({
      actorId: userId,
      organisationId,
      action: 'document.delete',
      resourceType: 'document',
      resourceId: documentId,
      metadata: {
        projectId: document.projectId,
        originalFilename: document.originalFilename,
        displayTitle: document.displayTitle,
        filePurged: true,
        contextRetained: true,
      },
    });

    return {
      documentId,
      deleted: true,
      filePurged: true,
      contextRetained: true,
    };
  }

  public async reprocessDocument(
    userId: string,
    organisationId: string,
    documentId: string,
    options: { userContext?: string | null } = {}
  ) {
    await assertUserInOrganisation(userId, organisationId);

    const document = await Document.findOne({
      documentId,
      organisationId,
      deletedAt: null,
      ...visibilityFilter(userId, 'uploadedBy'),
    }).lean();

    if (!document) {
      throw new Error('Document not found');
    }

    if (document.filePurgedAt || !document.storagePath) {
      throw new Error(
        'Original file was removed from storage; reprocessing needs the source file'
      );
    }

    const userContext =
      typeof options.userContext === 'string'
        ? options.userContext.trim().slice(0, 4000)
        : '';

    const job = await jobService.createJob({
      documentId,
      organisationId,
      projectId: document.projectId || null,
      userContext: userContext || null,
    });

    await auditService.logEvent({
      actorId: userId,
      organisationId,
      action: 'document.reprocess',
      resourceType: 'document',
      resourceId: documentId,
      metadata: {
        projectId: document.projectId,
        jobId: job.jobId,
        hasUserContext: Boolean(userContext),
      },
    });

    return {
      documentId,
      jobId: job.jobId,
      status: job.status,
    };
  }

  public async listAllDocuments(
    userId: string,
    organisationId: string,
    options: { projectId?: string; limit?: number } = {}
  ) {
    await assertUserInOrganisation(userId, organisationId);

    const filter: Record<string, unknown> = {
      organisationId,
      deletedAt: null,
      ...visibilityFilter(userId, 'uploadedBy'),
    };

    if (options.projectId) {
      filter.projectId = options.projectId;
    }

    const limit = Math.min(Math.max(options.limit ?? 100, 1), 500);

    const documents = await Document.find(filter)
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    return documents.map(toListItem);
  }
}

export default new DocumentService();
