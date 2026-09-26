import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import chatController from '../controller/chat.controller';
import userAuth from '../middleware/user.auth';
import {
  ApiSuccessSchema,
  ChatBody,
  ChatConversationListQuery,
  ChatConversationParams,
  ChatConversationRenameBody,
  ChatStreamBody,
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

  fastify.post(
    '/stream',
    {
      schema: {
        tags: ['Chat'],
        summary: 'Stream a grounded chat answer (text/event-stream)',
        description:
          'Answers only from the organisation\'s documents, with citations. Streams run.started, step, token, ' +
          'citation, decline, run.completed and error events. History comes from the stored conversation.',
        security: bearerSecurity,
        body: ChatStreamBody,
      },
    },
    chatController.stream
  );

  fastify.get(
    '/conversations',
    {
      schema: {
        tags: ['Chat'],
        summary: 'List your conversations',
        security: bearerSecurity,
        querystring: ChatConversationListQuery,
        response: { 200: ApiSuccessSchema, ...errorResponses },
      },
    },
    chatController.listConversations
  );

  fastify.get(
    '/conversations/:id',
    {
      schema: {
        tags: ['Chat'],
        summary: 'Get a conversation with its messages',
        security: bearerSecurity,
        params: ChatConversationParams,
        response: { 200: ApiSuccessSchema, ...errorResponses },
      },
    },
    chatController.getConversation
  );

  fastify.patch(
    '/conversations/:id',
    {
      schema: {
        tags: ['Chat'],
        summary: 'Rename a conversation',
        security: bearerSecurity,
        params: ChatConversationParams,
        body: ChatConversationRenameBody,
        response: { 200: ApiSuccessSchema, ...errorResponses },
      },
    },
    chatController.renameConversation
  );

  fastify.delete(
    '/conversations/:id',
    {
      schema: {
        tags: ['Chat'],
        summary: 'Delete a conversation',
        security: bearerSecurity,
        params: ChatConversationParams,
        response: { 200: ApiSuccessSchema, ...errorResponses },
      },
    },
    chatController.deleteConversation
  );
};

export default chatRouter;
