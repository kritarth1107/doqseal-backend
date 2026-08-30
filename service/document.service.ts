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

const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/jpg',
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
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
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
  }) {
    const {
      userId,
      organisationId,
      originalFilename,
      mimeType,
      buffer,
      consentGivenAt,
    } = params;

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

    if (!ALLOWED_MIME_TYPES.has(mimeType)) {
      throw new Error('Only PDF, PNG, and JPG files are allowed');
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
      },
    });

    const job = await jobService.createJob({
      documentId,
      organisationId,
      projectId,
    });

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
        'Original file was removed from storage; reprocessing needs the source file'
      );
    }

    const job = await jobService.createJob({
      documentId,
      organisationId,
      projectId: document.projectId || null,
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
