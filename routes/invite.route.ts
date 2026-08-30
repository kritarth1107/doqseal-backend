import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import membershipController from '../controller/membership.controller';
import userAuth from '../middleware/user.auth';
import {
  ApiSuccessSchema,
  InviteTokenParams,
  bearerSecurity,
  errorResponses,
} from '../openapi/schemas';

export const inviteRouter: FastifyPluginAsync = async (
  fastify: FastifyInstance
) => {
  fastify.addHook('preHandler', userAuth);

  fastify.post(
    '/:token/accept',
    {
      schema: {
        tags: ['Invites'],
        summary: 'Accept organisation invite',
        security: bearerSecurity,
        params: InviteTokenParams,
        response: { 200: ApiSuccessSchema, ...errorResponses },
      },
    },
    membershipController.acceptInvite
  );
};

export default inviteRouter;
