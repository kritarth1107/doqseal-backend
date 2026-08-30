import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import projectController from '../controller/project.controller';
import userAuth from '../middleware/user.auth';
import {
  ApiSuccessSchema,
  CreateProjectBody,
  UpdateProjectBody,
  ProjectIdParams,
  bearerSecurity,
  errorResponses,
} from '../openapi/schemas';

export const projectRouter: FastifyPluginAsync = async (
  fastify: FastifyInstance
) => {
  fastify.addHook('preHandler', userAuth);

  fastify.post(
    '/',
    {
      schema: {
        tags: ['Projects'],
        summary: 'Create project',
        security: bearerSecurity,
        body: CreateProjectBody,
        response: { 200: ApiSuccessSchema, 201: ApiSuccessSchema, ...errorResponses },
      },
    },
    projectController.create
  );

  fastify.get(
    '/',
    {
      schema: {
        tags: ['Projects'],
        summary: 'List projects',
        security: bearerSecurity,
        response: { 200: ApiSuccessSchema, ...errorResponses },
      },
    },
    projectController.list
  );

  fastify.get(
    '/:projectId',
    {
      schema: {
        tags: ['Projects'],
        summary: 'Get project by id',
        security: bearerSecurity,
        params: ProjectIdParams,
        response: { 200: ApiSuccessSchema, ...errorResponses },
      },
    },
    projectController.getOne
  );

  fastify.patch(
    '/:projectId',
    {
      schema: {
        tags: ['Projects'],
        summary: 'Update project settings (extraction context, webhooks)',
        security: bearerSecurity,
        params: ProjectIdParams,
        body: UpdateProjectBody,
        response: { 200: ApiSuccessSchema, ...errorResponses },
      },
    },
    projectController.update
  );
};

export default projectRouter;
