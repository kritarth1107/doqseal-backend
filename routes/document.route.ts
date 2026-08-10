import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import documentController from '../controller/document.controller';
import userAuth from '../middleware/user.auth';

export const documentRouter: FastifyPluginAsync = async (
  fastify: FastifyInstance
) => {
  fastify.addHook('preHandler', userAuth);

  fastify.post('/upload', documentController.upload);
  fastify.get('/', documentController.list);
  fastify.get('/:documentId/file', documentController.downloadFile);
  fastify.delete('/:documentId', documentController.deleteOne);
  fastify.get('/:documentId', documentController.getOne);
};

export default documentRouter;