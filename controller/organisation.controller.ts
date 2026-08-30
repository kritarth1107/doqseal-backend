import { FastifyRequest, FastifyReply } from 'fastify';
import organisationService from '../service/organisation.service';
import quotaService from '../service/quota.service';
import retentionService from '../service/retention.service';
import responseUtil from '../utils/response.util';
import {
  assertOrgRole,
  assertUserInOrganisation,
} from '../utils/org-access.util';
import auditService from '../service/audit.service';

/**
 * Organisation Controller - Handles organisation-related HTTP requests.
 * Handlers are arrow properties so Fastify route registration keeps `this` intact.
 */
export class OrganisationController {
  public getDetails = async (request: FastifyRequest, reply: FastifyReply) => {
    const { organisationId } = request.params as { organisationId: string };
    const sessionUser = (request as any).user;

    try {
      await assertUserInOrganisation(sessionUser.userId, organisationId);

      const details =
        await organisationService.getOrganisationDetails(organisationId);
      return responseUtil.success(
        reply,
        'Organisation details retrieved successfully',
        details
      );
    } catch (error: any) {
      const status = error.message?.includes('access')
        ? 403
        : error.message === 'Organisation not found'
          ? 404
          : 500;
      return responseUtil.error(
        reply,
        error.message || 'Failed to retrieve organisation details',
        status
      );
    }
  };

  public getUsage = async (request: FastifyRequest, reply: FastifyReply) => {
    const { organisationId } = request.params as { organisationId: string };
    const sessionUser = (request as any).user;

    try {
      await assertUserInOrganisation(sessionUser.userId, organisationId);

      const usage = await quotaService.getUsage(organisationId);
      return responseUtil.success(
        reply,
        'Organisation usage retrieved successfully',
        usage
      );
    } catch (error: any) {
      const status = error.message?.includes('access')
        ? 403
        : error.message === 'Organisation not found'
          ? 404
          : 500;
      return responseUtil.error(
        reply,
        error.message || 'Failed to retrieve organisation usage',
        status
      );
    }
  };

  public getStats = async (request: FastifyRequest, reply: FastifyReply) => {
    const { organisationId } = request.params as { organisationId: string };
    const sessionUser = (request as any).user;

    try {
      await assertUserInOrganisation(sessionUser.userId, organisationId);

      const stats =
        await organisationService.getOrganisationStats(organisationId);
      return responseUtil.success(
        reply,
        'Organisation stats retrieved successfully',
        stats
      );
    } catch (error: any) {
      const status = error.message?.includes('access')
        ? 403
        : error.message === 'Organisation not found'
          ? 404
          : 500;
      return responseUtil.error(
        reply,
        error.message || 'Failed to retrieve organisation stats',
        status
      );
    }
  };

  public eraseDataSubject = async (
    request: FastifyRequest,
    reply: FastifyReply
  ) => {
    const sessionUser = (request as any).user;
    const { id, email } = request.params as { id: string; email: string };

    try {
      await assertOrgRole(sessionUser.userId, id, 'admin');

      const result = await retentionService.eraseDataSubject(id, email);

      await auditService.logEvent({
        actorId: sessionUser.userId,
        organisationId: id,
        action: 'data_subject.erase',
        resourceType: 'data_subject',
        resourceId: result.email,
        metadata: {
          anonymizedEvents: result.anonymizedEvents,
          removedMemberships: result.removedMemberships,
        },
      });

      return responseUtil.success(
        reply,
        'Data subject erasure completed successfully',
        result
      );
    } catch (error: any) {
      const status = error.message?.includes('Requires')
        ? 403
        : error.message === 'Organisation not found'
          ? 404
          : 500;
      return responseUtil.error(
        reply,
        error.message || 'Failed to erase data subject',
        status
      );
    }
  };
}

export default new OrganisationController();
