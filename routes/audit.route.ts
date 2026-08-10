import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import auditController from '../controller/audit.controller';
import userAuth from '../middleware/user.auth';

export const auditRouter: FastifyPluginAsync = async (
  fastify: FastifyInstance
) => {
  fastify.addHook('preHandler', userAuth);

  fastify.get('/:id/audit-events', auditController.listEvents);
};

export default auditRouter;
