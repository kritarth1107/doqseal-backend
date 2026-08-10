import crypto from 'crypto';
import path from 'path';
import fs from 'fs/promises';
import axios from 'axios';
import Document from '../model/document.model';
import Project from '../model/project.model';
import Extraction from '../model/extraction.model';
import ExtractionJob from '../model/extractionJob.model';
import { v4 as uuidv4 } from 'uuid';
import StorageUtil from '../utils/storage.util';
import { assertUserInOrganisation, assertOrgRole } from '../utils/org-access.util';
import jobService from './job.service';
import quotaService from './quota.service';
import auditService from './audit.service';
import config from '../config/app.config';
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

export class DocumentService {
  public async uploadDocument(params: {
    userId: string;
    organisationId: string;
    projectId: string;
    originalFilename: string;
    mimeType: string;
    buffer: Buffer;
    consentGivenAt?: Date | null;
  }) {
    const {
      userId,
      organisationId,
      projectId,
      originalFilename,
      mimeType,
      buffer,
      consentGivenAt,
    } = params;

    await assertUserInOrganisation(userId, organisationId);
    await quotaService.assertUploadAllowed(organisationId);

    if (!ALLOWED_MIME_TYPES.has(mimeType)) {
      throw new Error('Only PDF, PNG, and JPG files are allowed');
    }

    if (buffer.length > MAX_FILE_SIZE) {
      throw new Error('File too large (max 20MB)');
    }

    const project = await Project.findOne({
      projectId,
      organisationId,
      deletedAt: null,
      status: 'active',
    }).lean();

    if (!project) {
      throw new Error('Project not found');
    }

    const documentId = uuidv4();
    const extension = path.extname(originalFilename) || '.pdf';
    const storagePath = StorageUtil.buildOriginalPath(
      organisationId,
      projectId,
      documentId,
      `${extension}.enc`
    );

    await StorageUtil.ensureDocumentDir(
      organisationId,
      projectId,
      documentId
    );

    const contentHash = crypto
      .createHash('sha256')
      .update(buffer)
      .digest('hex');

    const envelope = encryptBuffer(buffer, organisationId);
    await fs.writeFile(storagePath, envelope.ciphertext);

    const document = await Document.create({
      documentId,
      organisationId,
      projectId,
      originalFilename,
      mimeType,
      size: buffer.length,
      storagePath,
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
        consentGivenAt: consentGivenAt ?? null,
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
      message: 'File uploaded. Extraction queued.',
    };
  }

  public async listDocuments(
    userId: string,
    organisationId: string,
    projectId: string
  ) {
    await assertUserInOrganisation(userId, organisationId);

    const documents = await Document.find({
      organisationId,
      projectId,
      deletedAt: null,
    })
      .sort({ createdAt: -1 })
      .lean();

    return documents.map((doc) => ({
      documentId: doc.documentId,
      projectId: doc.projectId,
      originalFilename: doc.originalFilename,
      mimeType: doc.mimeType,
      size: doc.size,
      status: doc.status,
      contentHash: doc.contentHash,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    }));
  }

  public async getDocument(
    userId: string,
    organisationId: string,
    documentId: string
  ) {
    await assertUserInOrganisation(userId, organisationId);

    const document = await Document.findOne({
      documentId,
      organisationId,
      deletedAt: null,
    }).lean();

    if (!document) {
      throw new Error('Document not found');
    }

    const extraction = await Extraction.findOne({ documentId })
      .sort({ version: -1 })
      .lean();

    const latestJob = await ExtractionJob.findOne({ documentId })
      .sort({ createdAt: -1 })
      .lean();

    return {
      document: {
        documentId: document.documentId,
        projectId: document.projectId,
        originalFilename: document.originalFilename,
        mimeType: document.mimeType,
        size: document.size,
        status: document.status,
        contentHash: document.contentHash,
        createdAt: document.createdAt,
        updatedAt: document.updatedAt,
      },
      job: latestJob
        ? {
            jobId: latestJob.jobId,
            status: latestJob.status,
            error: latestJob.error,
            completedAt: latestJob.completedAt,
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
    }).lean();

    if (!document) {
      throw new Error('Document not found');
    }

    const encryptedBytes = await fs.readFile(document.storagePath);

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
    await assertOrgRole(userId, organisationId, 'admin');

    const document = await Document.findOne({
      documentId,
      organisationId,
      deletedAt: null,
    });

    if (!document) {
      throw new Error('Document not found');
    }

    try {
      await fs.unlink(document.storagePath);
    } catch {
      // File may already be missing
    }

    await Promise.all([
      Extraction.deleteMany({ documentId }),
      ExtractionJob.deleteMany({ documentId }),
    ]);

    try {
      const baseUrl = config.aiEngine.url.replace(/\/$/, '');
      await axios.delete(`${baseUrl}/rag/documents/${documentId}`, {
        params: { organisationId },
        timeout: 15_000,
      });
    } catch (error) {
      console.warn('RAG cascade delete failed:', error);
    }

    document.deletedAt = new Date();
    document.status = 'failed';
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
      },
    });

    return { documentId, deleted: true };
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
    };

    if (options.projectId) {
      filter.projectId = options.projectId;
    }

    const limit = Math.min(Math.max(options.limit ?? 100, 1), 500);

    const documents = await Document.find(filter)
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    return documents.map((doc) => ({
      documentId: doc.documentId,
      projectId: doc.projectId,
      originalFilename: doc.originalFilename,
      mimeType: doc.mimeType,
      size: doc.size,
      status: doc.status,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    }));
  }
}

export default new DocumentService();