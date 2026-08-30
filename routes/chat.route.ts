import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import chatController from '../controller/chat.controller';
import userAuth from '../middleware/user.auth';
import {
  ApiSuccessSchema,
  ChatBody,
  bearerSecurity,
  errorResponses,
} from '../openapi/schemas';

export const chatRouter: FastifyPluginAsync = async (
  fastify: FastifyInstance
) => {
  fastify.addHook('preHandler', userAuth);

  fastify.post(
    '/',
    {
      schema: {
        tags: ['Chat'],
        summary: 'Send RAG chat message',
        security: bearerSecurity,
        body: ChatBody,
        response: { 200: ApiSuccessSchema, ...errorResponses },
      },
    },
    chatController.send
  );
};

export default chatRouter;
