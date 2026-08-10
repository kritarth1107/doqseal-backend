import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import apiKeyController from '../controller/apiKey.controller';
import userAuth from '../middleware/user.auth';

/**
 * API Key Router - Handles organisation-level API key management
 */
export const apiKeyRouter: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  // Apply userAuth middleware to all routes in this domain
  fastify.addHook('preHandler', userAuth);

  // POST /api/v1/manage/api-keys
  fastify.post('/', apiKeyController.create);

  // GET /api/v1/manage/api-keys/:organisationId
  fastify.get('/:organisationId', apiKeyController.list);

  // DELETE /api/v1/manage/api-keys/:organisationId/:keyId
  fastify.delete('/:organisationId/:keyId', apiKeyController.revoke);
};

export default apiKeyRouter;
