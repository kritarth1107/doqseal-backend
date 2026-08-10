import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import jobController from '../controller/job.controller';
import userAuth from '../middleware/user.auth';

export const jobRouter: FastifyPluginAsync = async (
  fastify: FastifyInstance
) => {
  fastify.addHook('preHandler', userAuth);

  fastify.get('/:jobId', jobController.getOne);
};

export default jobRouter;