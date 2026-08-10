import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import projectController from '../controller/project.controller';
import userAuth from '../middleware/user.auth';

export const projectRouter: FastifyPluginAsync = async (
  fastify: FastifyInstance
) => {
  fastify.addHook('preHandler', userAuth);

  fastify.post('/', projectController.create);
  fastify.get('/', projectController.list);
  fastify.get('/:projectId', projectController.getOne);
};

export default projectRouter;