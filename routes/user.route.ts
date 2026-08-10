import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import userController from '../controller/user.controller';
import userAuth from '../middleware/user.auth';

/**
 * User Router - Handles all user-related endpoints
 */
export const userRouter: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  // Add authentication middleware to all routes in this router
  fastify.addHook('preHandler', userAuth);

  // GET /api/v1/user/me
  fastify.get('/me', userController.getMe);

  // POST /api/v1/user/organisations
  fastify.post('/organisations', userController.createOrganisation);
};


export default userRouter;
