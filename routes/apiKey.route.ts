import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import apiKeyController from '../controller/apiKey.controller';
import userAuth from '../middleware/user.auth';
import {
  ApiKeyOrgParams,
  ApiKeyParams,
  ApiSuccessSchema,
  CreateApiKeyBody,
  UpdateOrgWebhooksBody,
  bearerSecurity,
  errorResponses,
} from '../openapi/schemas';

export const apiKeyRouter: FastifyPluginAsync = async (
  fastify: FastifyInstance
) => {
  fastify.addHook('preHandler', userAuth);

  fastify.get(
    '/webhooks/:organisationId',
    {
      schema: {
        tags: ['API Keys'],
        summary: 'Get organisation webhooks',
        security: bearerSecurity,
        params: ApiKeyOrgParams,
        response: { 200: ApiSuccessSchema, ...errorResponses },
      },
    },
    apiKeyController.getWebhooks
  );

  fastify.put(
    '/webhooks/:organisationId',
    {
      schema: {
        tags: ['API Keys'],
        summary: 'Update organisation webhooks',
        security: bearerSecurity,
        params: ApiKeyOrgParams,
        body: UpdateOrgWebhooksBody,
        response: { 200: ApiSuccessSchema, ...errorResponses },
      },
    },
    apiKeyController.updateWebhooks
  );

  fastify.post(
    '/',
    {
      schema: {
        tags: ['API Keys'],
        summary: 'Create API key',
        security: bearerSecurity,
        body: CreateApiKeyBody,
        response: { 200: ApiSuccessSchema, ...errorResponses },
      },
    },
    apiKeyController.create
  );

  fastify.get(
    '/:organisationId',
    {
      schema: {
        tags: ['API Keys'],
        summary: 'List API keys for organisation',
        security: bearerSecurity,
        params: ApiKeyOrgParams,
        response: { 200: ApiSuccessSchema, ...errorResponses },
      },
    },
    apiKeyController.list
  );

  fastify.delete(
    '/:organisationId/:keyId',
    {
      schema: {
        tags: ['API Keys'],
        summary: 'Revoke API key',
        security: bearerSecurity,
        params: ApiKeyParams,
        response: { 200: ApiSuccessSchema, ...errorResponses },
      },
    },
    apiKeyController.revoke
  );
};

export default apiKeyRouter;
