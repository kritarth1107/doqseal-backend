import { FastifyRequest, FastifyReply } from 'fastify';
import responseUtil from '../utils/response.util';
import domainAccessService from '../service/domainAccess.service';

export class DomainAccessController {
  private orgIdFromRequest(request: FastifyRequest): string {
    const params = request.params as { organisationId?: string };
    return params.organisationId || '';
  }
  public async getStatus(request: FastifyRequest, reply: FastifyReply) {
    const sessionUser = (request as any).user;
    try {
      const organisationId = this.orgIdFromRequest(request);
      const status = await domainAccessService.getStatus(
        sessionUser.userId,
        organisationId
      );
      return responseUtil.success(reply, 'Domain access status', status);
    } catch (error: any) {
      const message = error.message || 'Failed to load domain settings';
      const status = /Requires|access/i.test(message)
        ? 403
        : /not found/i.test(message)
          ? 404
          : 400;
      return responseUtil.error(reply, message, status);
    }
  }

  public async claimDomain(request: FastifyRequest, reply: FastifyReply) {
    const sessionUser = (request as any).user;
    const body = (request.body || {}) as { domain?: string };
    try {
      const organisationId = this.orgIdFromRequest(request);
      if (!body.domain?.trim()) {
        return responseUtil.error(reply, 'domain is required', 400);
      }
      const status = await domainAccessService.claimDomain(
        sessionUser.userId,
        organisationId,
        body.domain
      );
      return responseUtil.success(reply, 'Domain claim started', status);
    } catch (error: any) {
      const message = error.message || 'Failed to claim domain';
      return responseUtil.error(reply, message, /Requires|access/i.test(message) ? 403 : 400);
    }
  }

  public async verifyDomain(request: FastifyRequest, reply: FastifyReply) {
    const sessionUser = (request as any).user;
    try {
      const organisationId = this.orgIdFromRequest(request);
      const status = await domainAccessService.verifyDomain(
        sessionUser.userId,
        organisationId
      );
      return responseUtil.success(reply, 'Domain verified successfully', status);
    } catch (error: any) {
      const message = error.message || 'Domain verification failed';
      return responseUtil.error(reply, message, /Requires|access/i.test(message) ? 403 : 400);
    }
  }

  public async updateSettings(request: FastifyRequest, reply: FastifyReply) {
    const sessionUser = (request as any).user;
    const body = (request.body || {}) as { autoJoinEnabled?: boolean };
    try {
      const organisationId = this.orgIdFromRequest(request);
      const status = await domainAccessService.updateSettings(
        sessionUser.userId,
        organisationId,
        { autoJoinEnabled: body.autoJoinEnabled }
      );
      return responseUtil.success(reply, 'Domain settings updated', status);
    } catch (error: any) {
      const message = error.message || 'Failed to update domain settings';
      return responseUtil.error(reply, message, /Requires|access/i.test(message) ? 403 : 400);
    }
  }

  public async releaseDomain(request: FastifyRequest, reply: FastifyReply) {
    const sessionUser = (request as any).user;
    try {
      const organisationId = this.orgIdFromRequest(request);
      const status = await domainAccessService.releaseDomain(
        sessionUser.userId,
        organisationId
      );
      return responseUtil.success(reply, 'Domain released', status);
    } catch (error: any) {
      const message = error.message || 'Failed to release domain';
      return responseUtil.error(reply, message, /Requires|access/i.test(message) ? 403 : 400);
    }
  }
}

export default new DomainAccessController();
