import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import organisationController from '../controller/organisation.controller';
import userAuth from '../middleware/user.auth';
import {
  ApiSuccessSchema,
  EraseDataSubjectParams,
  OrganisationIdParams,
  bearerSecurity,
  errorResponses,
} from '../openapi/schemas';

export const organisationRouter: FastifyPluginAsync = async (
  fastify: FastifyInstance
) => {
  fastify.addHook('preHandler', userAuth);

  fastify.get(
    '/:organisationId/usage',
    {
      schema: {
        tags: ['Organisations'],
        summary: 'Get organisation usage / quotas',
        security: bearerSecurity,
        params: OrganisationIdParams,
        response: { 200: ApiSuccessSchema, ...errorResponses },
      },
    },
    organisationController.getUsage
  );

  fastify.get(
    '/:organisationId/stats',
    {
      schema: {
        tags: ['Organisations'],
        summary: 'Get organisation stats',
        security: bearerSecurity,
        params: OrganisationIdParams,
        response: { 200: ApiSuccessSchema, ...errorResponses },
      },
    },
    organisationController.getStats
  );

  fastify.get(
    '/:organisationId',
    {
      schema: {
        tags: ['Organisations'],
        summary: 'Get organisation details',
        security: bearerSecurity,
        params: OrganisationIdParams,
        response: { 200: ApiSuccessSchema, ...errorResponses },
      },
    },
    organisationController.getDetails
  );

  fastify.delete(
    '/:id/data-subject/:email',
    {
      schema: {
        tags: ['Organisations'],
        summary: 'Erase data subject (DPDP)',
        security: bearerSecurity,
        params: EraseDataSubjectParams,
        response: { 200: ApiSuccessSchema, ...errorResponses },
      },
    },
    organisationController.eraseDataSubject
  );
};

export default organisationRouter;
