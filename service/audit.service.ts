import AuditEvent from '../model/auditEvent.model';
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
}

export default new AuditService();
