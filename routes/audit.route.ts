import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import auditController from '../controller/audit.controller';
import userAuth from '../middleware/user.auth';
import {
  ApiSuccessSchema,
  AuditQuery,
  OrgIdParams,
  bearerSecurity,
  errorResponses,
} from '../openapi/schemas';

export const auditRouter: FastifyPluginAsync = async (
  fastify: FastifyInstance
) => {
  fastify.addHook('preHandler', userAuth);

  fastify.get(
    '/:id/audit-events',
    {
      schema: {
        tags: ['Audit'],
        summary: 'List organisation audit events',
        security: bearerSecurity,
        params: OrgIdParams,
        querystring: AuditQuery,
        response: { 200: ApiSuccessSchema, ...errorResponses },
      },
    },
    auditController.listEvents
  );
};

export default auditRouter;
