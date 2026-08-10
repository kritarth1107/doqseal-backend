import { FastifyRequest, FastifyReply } from 'fastify';
import apiKeyService from '../service/apiKey.service';
import responseUtil from '../utils/response.util';
import { z } from 'zod';

/**
 * ApiKey Controller - Handles API Key management endpoints
 */
export class ApiKeyController {
  /**
   * Create a new API Key
   */
  public async create(request: FastifyRequest, reply: FastifyReply) {
    try {
      const user = (request as any).user;
      
      const schema = z.object({
        organisationId: z.string(),
        name: z.string().min(3).max(50),
        expiresInDays: z.number().optional() // 0 or undefined for "Never"
      });

      const { organisationId, name, expiresInDays } = schema.parse(request.body);

      // Verify user is member of this organisation and has authority (owner/admin)
      const membership = user.organisations?.find((o: any) => o.organisationId === organisationId);
      if (!membership || (membership.role !== 'owner' && membership.role !== 'admin')) {
        return responseUtil.error(reply, 'Unauthorized: Only admins can manage API keys', 403);
      }

      const apiKey = await apiKeyService.createApiKey({
        organisationId,
        name,
        createdBy: user.userId,
        expiresInDays
      });

      return responseUtil.success(reply, 'API Key generated successfully. Save it now, it won\'t be shown again.', apiKey);
    } catch (error: any) {
      return responseUtil.error(reply, error.message || error.toString(), 400);
    }
  }

  /**
   * List all API Keys for an organisation
   */
  public async list(request: FastifyRequest, reply: FastifyReply) {
    try {
      const user = (request as any).user;
      const { organisationId } = request.params as { organisationId: string };

      // Verify membership
      const membership = user.organisations?.find((o: any) => o.organisationId === organisationId);
      if (!membership) {
        return responseUtil.error(reply, 'Access denied to this organisation', 403);
      }

      const keys = await apiKeyService.listOrganisationKeys(organisationId);
      return responseUtil.success(reply, 'API Keys retrieved successfully', keys);

    } catch (error: any) {
      return responseUtil.error(reply, error.message || error.toString(), 400);
    }
  }

  /**
   * Revoke an API Key
   */
  public async revoke(request: FastifyRequest, reply: FastifyReply) {
    try {
      const user = (request as any).user;
      const { organisationId, keyId } = request.params as { organisationId: string, keyId: string };

      // Verify authority
      const membership = user.organisations?.find((o: any) => o.organisationId === organisationId);
      if (!membership || (membership.role !== 'owner' && membership.role !== 'admin')) {
        return responseUtil.error(reply, 'Unauthorized to revoke keys', 403);
      }

      await apiKeyService.revokeKey(organisationId, keyId);

      return responseUtil.success(reply, 'API Key revoked successfully');
    } catch (error: any) {
      return responseUtil.error(reply, error.message || error.toString(), 400);
    }
  }
}

export default new ApiKeyController();
