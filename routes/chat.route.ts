import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import chatController from '../controller/chat.controller';
import userAuth from '../middleware/user.auth';

export const chatRouter: FastifyPluginAsync = async (
  fastify: FastifyInstance
) => {
  fastify.addHook('preHandler', userAuth);

  fastify.post('/', chatController.send);
};

export default chatRouter;
