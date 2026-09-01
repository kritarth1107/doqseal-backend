import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import mediaController from '../controller/media.controller';
import userAuth from '../middleware/user.auth';
import { ApiSuccessSchema, bearerSecurity, errorResponses } from '../openapi/schemas';

export const mediaRouter: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  fastify.addHook('preHandler', userAuth);

  fastify.get(
    '/profile/*',
    {
      schema: {
        tags: ['Media'],
        summary: 'Get profile image (user avatar or org logo)',
        security: bearerSecurity,
        response: { 200: ApiSuccessSchema, ...errorResponses },
      },
    },
    mediaController.getProfileMedia
  );
};

export default mediaRouter;
