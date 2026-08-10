import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import organisationController from '../controller/organisation.controller';
import userAuth from '../middleware/user.auth';

/**
 * Organisation Router - Handles all organisation-related endpoints
 */
export const organisationRouter: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  // Add authentication middleware to all routes in this router
  fastify.addHook('preHandler', userAuth);

  // GET /api/v1/organisations/:organisationId/usage
  fastify.get('/:organisationId/usage', organisationController.getUsage);

  // GET /api/v1/organisations/:organisationId/stats
  fastify.get('/:organisationId/stats', organisationController.getStats);

  // GET /api/v1/organisations/:organisationId
  fastify.get('/:organisationId', organisationController.getDetails);
};

export default organisationRouter;
