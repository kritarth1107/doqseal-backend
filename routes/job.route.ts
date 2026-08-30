import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import jobController from '../controller/job.controller';
import userAuth from '../middleware/user.auth';
import {
  ApiSuccessSchema,
  JobIdParams,
  bearerSecurity,
  errorResponses,
} from '../openapi/schemas';

export const jobRouter: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  fastify.addHook('preHandler', userAuth);

  fastify.get(
    '/:jobId',
    {
      schema: {
        tags: ['Jobs'],
        summary: 'Get extraction job status',
        security: bearerSecurity,
        params: JobIdParams,
        response: { 200: ApiSuccessSchema, ...errorResponses },
      },
    },
    jobController.getOne
  );
};

export default jobRouter;
