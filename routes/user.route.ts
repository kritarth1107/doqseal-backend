import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import userController from '../controller/user.controller';
import userAuth from '../middleware/user.auth';
import {
  ApiSuccessSchema,
  CreateOrganisationBody,
  CompleteOnboardingBody,
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
    '/onboarding',
    {
      schema: {
        tags: ['User'],
        summary: 'Complete first-time user onboarding',
        security: bearerSecurity,
        body: CompleteOnboardingBody,
        response: { 200: ApiSuccessSchema, ...errorResponses },
      },
    },
    userController.completeOnboarding
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

  fastify.get(
    '/sessions',
    {
      schema: {
        tags: ['User'],
        summary: 'List active sessions',
        security: bearerSecurity,
        response: { 200: ApiSuccessSchema, ...errorResponses },
      },
    },
    userController.listSessions
  );

  fastify.delete(
    '/sessions/:fingerprint',
    {
      schema: {
        tags: ['User'],
        summary: 'Revoke a session',
        security: bearerSecurity,
        response: { 200: ApiSuccessSchema, ...errorResponses },
      },
    },
    userController.revokeSession
  );

  fastify.post(
    '/logout-all',
    {
      schema: {
        tags: ['User'],
        summary: 'Log out of all devices',
        security: bearerSecurity,
        response: { 200: ApiSuccessSchema, ...errorResponses },
      },
    },
    userController.logoutAll
  );

  fastify.delete(
    '/me',
    {
      schema: {
        tags: ['User'],
        summary: 'Delete current user account',
        security: bearerSecurity,
        response: { 200: ApiSuccessSchema, ...errorResponses },
      },
    },
    userController.deleteAccount
  );
};

export default userRouter;
