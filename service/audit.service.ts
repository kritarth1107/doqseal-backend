import AuditEvent from '../model/auditEvent.model';
import User from '../model/user.model';
import { assertUserInOrganisation } from '../utils/org-access.util';

export interface LogAuditEventParams {
  actorId: string;
  organisationId: string;
  action: string;
  resourceType: string;
  resourceId: string;
  metadata?: Record<string, unknown> | null;
  timestamp?: Date;
}

export class AuditService {
  public async logEvent(params: LogAuditEventParams) {
    const event = await AuditEvent.create({
      actorId: params.actorId,
      organisationId: params.organisationId,
      action: params.action,
      resourceType: params.resourceType,
      resourceId: params.resourceId,
      metadata: params.metadata ?? null,
      timestamp: params.timestamp ?? new Date(),
    });

    return {
      actorId: event.actorId,
      organisationId: event.organisationId,
      action: event.action,
      resourceType: event.resourceType,
      resourceId: event.resourceId,
      metadata: event.metadata,
      timestamp: event.timestamp,
    };
  }

  public async listAuditEvents(
    userId: string,
    organisationId: string,
    options: { page?: number; limit?: number } = {}
  ) {
    await assertUserInOrganisation(userId, organisationId);

    const page = Math.max(options.page ?? 1, 1);
    const limit = Math.min(Math.max(options.limit ?? 20, 1), 100);
    const skip = (page - 1) * limit;

    const [events, total] = await Promise.all([
      AuditEvent.find({ organisationId })
        .sort({ timestamp: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      AuditEvent.countDocuments({ organisationId }),
    ]);

    return {
      events: events.map((event) => ({
        actorId: event.actorId,
        organisationId: event.organisationId,
        action: event.action,
        resourceType: event.resourceType,
        resourceId: event.resourceId,
        metadata: event.metadata,
        timestamp: event.timestamp,
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 0,
      },
    };
  }

  public async listDocumentTimeline(
    userId: string,
    organisationId: string,
    documentId: string
  ) {
    await assertUserInOrganisation(userId, organisationId);

    const events = await AuditEvent.find({
      organisationId,
      $or: [
        { resourceType: 'document', resourceId: documentId },
        { resourceType: 'webhook', resourceId: documentId },
        { resourceType: 'webhook', 'metadata.documentId': documentId },
        { resourceType: 'extraction', 'metadata.documentId': documentId },
        { resourceType: 'extraction', resourceId: documentId },
      ],
    })
      .sort({ timestamp: -1 })
      .limit(100)
      .lean();

    const actorIds = Array.from(
      new Set(
        events
          .map((e) => e.actorId)
          .filter(
            (id): id is string =>
              Boolean(id) && !String(id).startsWith('system:')
          )
      )
    );

    const users = actorIds.length
      ? await User.find({ userId: { $in: actorIds }, deletedAt: null })
          .select('userId name email avatar')
          .lean()
      : [];
    const userById = new Map(users.map((u) => [u.userId, u]));

    return events.map((event) => {
      const user = userById.get(event.actorId);
      const isSystem = String(event.actorId || '').startsWith('system:');
      return {
        actorId: event.actorId,
        actor: isSystem
          ? {
              userId: event.actorId,
              name: event.actorId === 'system:webhook' ? 'Webhook' : 'System',
              email: null,
              avatar: null,
              isSystem: true,
            }
          : user
            ? {
                userId: user.userId,
                name: user.name,
                email: user.email || null,
                avatar: user.avatar || null,
                isSystem: false,
              }
            : event.actorId
              ? {
                  userId: event.actorId,
                  name: event.actorId.slice(0, 8),
                  email: null,
                  avatar: null,
                  isSystem: false,
                }
              : null,
        organisationId: event.organisationId,
        action: event.action,
        resourceType: event.resourceType,
        resourceId: event.resourceId,
        metadata: event.metadata,
        timestamp: event.timestamp,
      };
    });
  }
}

export default new AuditService();
