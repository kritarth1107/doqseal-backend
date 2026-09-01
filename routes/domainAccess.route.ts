import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import domainAccessController from '../controller/domainAccess.controller';
import userAuth from '../middleware/user.auth';
import {
  ApiSuccessSchema,
  OrganisationIdParams,
  bearerSecurity,
  errorResponses,
} from '../openapi/schemas';

export const domainAccessRouter: FastifyPluginAsync = async (
  fastify: FastifyInstance
) => {
  fastify.addHook('preHandler', userAuth);

  fastify.get(
    '/:organisationId/domain',
    {
      schema: {
        tags: ['Organisations'],
        summary: 'Get domain auto-access status',
        security: bearerSecurity,
        params: OrganisationIdParams,
        response: { 200: ApiSuccessSchema, ...errorResponses },
      },
    },
    domainAccessController.getStatus.bind(domainAccessController)
  );

  fastify.post(
    '/:organisationId/domain/claim',
    {
      schema: {
        tags: ['Organisations'],
        summary: 'Start domain claim (returns TXT verification instructions)',
        security: bearerSecurity,
        params: OrganisationIdParams,
        response: { 200: ApiSuccessSchema, ...errorResponses },
      },
    },
    domainAccessController.claimDomain.bind(domainAccessController)
  );

  fastify.post(
    '/:organisationId/domain/verify',
    {
      schema: {
        tags: ['Organisations'],
        summary: 'Verify domain ownership via DNS TXT record',
        security: bearerSecurity,
        params: OrganisationIdParams,
        response: { 200: ApiSuccessSchema, ...errorResponses },
      },
    },
    domainAccessController.verifyDomain.bind(domainAccessController)
  );

  fastify.patch(
    '/:organisationId/domain/settings',
    {
      schema: {
        tags: ['Organisations'],
        summary: 'Update domain auto-join settings',
        security: bearerSecurity,
        params: OrganisationIdParams,
        response: { 200: ApiSuccessSchema, ...errorResponses },
      },
    },
    domainAccessController.updateSettings.bind(domainAccessController)
  );

  fastify.delete(
    '/:organisationId/domain',
    {
      schema: {
        tags: ['Organisations'],
        summary: 'Release verified domain',
        security: bearerSecurity,
        params: OrganisationIdParams,
        response: { 200: ApiSuccessSchema, ...errorResponses },
      },
    },
    domainAccessController.releaseDomain.bind(domainAccessController)
  );
};

export default domainAccessRouter;
