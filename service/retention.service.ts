import Document from '../model/document.model';
import Organisation from '../model/organisation.model';
import auditService from './audit.service';
import { deleteEncryptedObject } from '../utils/blob-storage.util';
import { MIN_RETENTION_DAYS } from '../constants/plans';
import User from '../model/user.model';
import Membership from '../model/membership.model';
import AuditEvent from '../model/auditEvent.model';

const REDACTED = '[redacted]';

/**
 * Retention: after per-document TTL, delete the original binary only.
 * Extraction data + RAG context stay for AI chat.
 * keepForever docs are never auto-purged.
 */
export class RetentionService {
  /** Purge expired originals across all orgs (or one org). */
  public async purgeExpiredFiles(orgId?: string) {
    const now = new Date();
    const filter: Record<string, unknown> = {
      deletedAt: null,
      keepForever: { $ne: true },
      filePurgedAt: null,
      fileExpiresAt: { $lte: now, $ne: null },
      storagePath: { $nin: [null, ''] },
    };
    if (orgId) {
      filter.organisationId = orgId;
    }

    const expiredDocuments = await Document.find(filter).limit(500);
    let purgedCount = 0;

    for (const document of expiredDocuments) {
      try {
        await deleteEncryptedObject({
          storagePath: document.storagePath,
          storageUri: document.storageUri,
          storageProvider: document.storageProvider,
        });
      } catch {
        // Object may already be missing
      }

      document.filePurgedAt = new Date();
      document.storagePath = '';
      document.storageUri = null;
      document.encryption = null;
      document.isEncrypted = false;
      // Keep status as completed/failed — context still usable
      await document.save();

      await auditService.logEvent({
        actorId: 'system:retention',
        organisationId: document.organisationId,
        action: 'document.file_ttl_purge',
        resourceType: 'document',
        resourceId: document.documentId,
        metadata: {
          retentionDays: document.retentionDays,
          fileExpiresAt: document.fileExpiresAt,
          contextRetained: true,
          originalCreatedAt: document.createdAt,
        },
      });

      purgedCount += 1;
    }

    return {
      organisationId: orgId || 'all',
      purgedCount,
      minRetentionDays: MIN_RETENTION_DAYS,
    };
  }

  /** @deprecated Prefer purgeExpiredFiles — kept for admin route compatibility */
  public async purgeExpiredDocuments(orgId: string) {
    return this.purgeExpiredFiles(orgId);
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
