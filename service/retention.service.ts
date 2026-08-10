import axios from 'axios';
import fs from 'fs/promises';
import Organisation from '../model/organisation.model';
import Document from '../model/document.model';
import Extraction from '../model/extraction.model';
import ExtractionJob from '../model/extractionJob.model';
import AuditEvent from '../model/auditEvent.model';
import Membership from '../model/membership.model';
import User from '../model/user.model';
import auditService from './audit.service';
import config from '../config/app.config';

const DEFAULT_RETENTION_DAYS = 365;
const REDACTED = '[redacted]';

export class RetentionService {
  public async purgeExpiredDocuments(orgId: string) {
    const organisation = await Organisation.findOne({
      publicId: orgId,
      deletedAt: null,
    }).lean();

    if (!organisation) {
      throw new Error('Organisation not found');
    }

    const retentionDays =
      typeof organisation.planDetails?.retentionDays === 'number'
        ? organisation.planDetails.retentionDays
        : DEFAULT_RETENTION_DAYS;

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - retentionDays);

    const expiredDocuments = await Document.find({
      organisationId: orgId,
      deletedAt: null,
      createdAt: { $lt: cutoff },
    });

    let purgedCount = 0;

    for (const document of expiredDocuments) {
      try {
        await fs.unlink(document.storagePath);
      } catch {
        // File may already be missing
      }

      await Promise.all([
        Extraction.deleteMany({ documentId: document.documentId }),
        ExtractionJob.deleteMany({ documentId: document.documentId }),
      ]);

      try {
        const baseUrl = config.aiEngine.url.replace(/\/$/, '');
        await axios.delete(`${baseUrl}/rag/documents/${document.documentId}`, {
          params: { organisationId: orgId },
          timeout: 15_000,
        });
      } catch (error) {
        console.warn('RAG cascade delete failed during retention purge:', error);
      }

      document.deletedAt = new Date();
      document.status = 'failed';
      await document.save();

      await auditService.logEvent({
        actorId: 'system:retention',
        organisationId: orgId,
        action: 'document.retention_purge',
        resourceType: 'document',
        resourceId: document.documentId,
        metadata: {
          retentionDays,
          originalCreatedAt: document.createdAt,
        },
      });

      purgedCount += 1;
    }

    return {
      organisationId: orgId,
      retentionDays,
      purgedCount,
    };
  }

  public async eraseDataSubject(orgId: string, email: string) {
    const organisation = await Organisation.findOne({
      publicId: orgId,
      deletedAt: null,
    }).lean();

    if (!organisation) {
      throw new Error('Organisation not found');
    }

    const normalizedEmail = email.trim().toLowerCase();
    const user = await User.findOne({
      email: normalizedEmail,
      deletedAt: null,
    }).lean();

    let anonymizedEvents = 0;
    let removedMemberships = 0;

    if (user) {
      const auditEvents = await AuditEvent.find({
        organisationId: orgId,
        $or: [
          { actorId: user.userId },
          { 'metadata.email': normalizedEmail },
        ],
      });

      for (const event of auditEvents) {
        event.actorId = REDACTED;
        if (event.metadata && typeof event.metadata === 'object') {
          const metadata = { ...(event.metadata as Record<string, unknown>) };
          for (const key of Object.keys(metadata)) {
            if (
              typeof metadata[key] === 'string' &&
              (metadata[key] as string).toLowerCase().includes(normalizedEmail)
            ) {
              metadata[key] = REDACTED;
            }
          }
          metadata.erasedAt = new Date().toISOString();
          event.metadata = metadata;
        }
        await event.save();
        anonymizedEvents += 1;
      }

      const membership = await Membership.findOne({
        userId: user.userId,
        organisationId: organisation._id,
        deletedAt: null,
      });

      if (membership) {
        membership.deletedAt = new Date();
        await membership.save();
        removedMemberships += 1;

        await User.updateOne(
          { userId: user.userId },
          {
            $pull: {
              organisations: { organisationId: orgId },
            },
          }
        );

        await Organisation.updateOne(
          { _id: organisation._id },
          { $inc: { memberCount: -1 } }
        );
      }
    } else {
      const auditEvents = await AuditEvent.find({
        organisationId: orgId,
        'metadata.email': normalizedEmail,
      });

      for (const event of auditEvents) {
        event.actorId = REDACTED;
        if (event.metadata && typeof event.metadata === 'object') {
          const metadata = { ...(event.metadata as Record<string, unknown>) };
          for (const key of Object.keys(metadata)) {
            if (
              typeof metadata[key] === 'string' &&
              (metadata[key] as string).toLowerCase().includes(normalizedEmail)
            ) {
              metadata[key] = REDACTED;
            }
          }
          metadata.erasedAt = new Date().toISOString();
          event.metadata = metadata;
        }
        await event.save();
        anonymizedEvents += 1;
      }
    }

    return {
      organisationId: orgId,
      email: normalizedEmail,
      anonymizedEvents,
      removedMemberships,
    };
  }
}

export default new RetentionService();
