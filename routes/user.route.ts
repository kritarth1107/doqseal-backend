import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import userController from '../controller/user.controller';
import userAuth from '../middleware/user.auth';
import {
  ApiSuccessSchema,
  CreateOrganisationBody,
  bearerSecurity,
  errorResponses,
} from '../openapi/schemas';

export const userRouter: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  fastify.addHook('preHandler', userAuth);

  fastify.get(
    '/me',
    {
      schema: {
        tags: ['User'],
        summary: 'Get current user profile',
        security: bearerSecurity,
        response: { 200: ApiSuccessSchema, ...errorResponses },
      },
    },
    userController.getMe
  );

  fastify.post(
    '/organisations',
    {
      schema: {
        tags: ['User'],
        summary: 'Create organisation',
        security: bearerSecurity,
        body: CreateOrganisationBody,
        response: { 200: ApiSuccessSchema, ...errorResponses },
      },
    },
    userController.createOrganisation
  );
};

export default userRouter;
