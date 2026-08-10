import { FastifyRequest, FastifyReply } from 'fastify';
import auditService from '../service/audit.service';
import responseUtil from '../utils/response.util';

export class AuditController {
  public async listEvents(request: FastifyRequest, reply: FastifyReply) {
    const sessionUser = (request as any).user;
    const { id } = request.params as { id: string };
    const { page, limit } = request.query as { page?: string; limit?: string };

    try {
      const result = await auditService.listAuditEvents(
        sessionUser.userId,
        id,
        {
          page: page ? Number(page) : undefined,
          limit: limit ? Number(limit) : undefined,
        }
      );

      return responseUtil.success(
        reply,
        'Audit events retrieved successfully',
        result.events,
        200,
        result.pagination
      );
    } catch (error: any) {
      const status = error.message?.includes('access') ? 403 : 500;
      return responseUtil.error(
        reply,
        error.message || 'Failed to retrieve audit events',
        status
      );
    }
  }
}

export default new AuditController();
