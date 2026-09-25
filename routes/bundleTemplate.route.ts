import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import bundleTemplateController from '../controller/bundleTemplate.controller';
import userAuth from '../middleware/user.auth';
import { requireFeature } from '../middleware/featureFlag.middleware';
import {
  ApiSuccessSchema,
  bearerSecurity,
  errorResponses,
} from '../openapi/schemas';
import {
  CreateBundleTemplateBody,
  UpdateBundleTemplateBody,
  BundleTemplateIdParams,
  BundleTemplateListQuery,
  PublishTemplateBody,
  CloneTemplateBody,
} from '../openapi/bundle.schemas';
import { z } from 'zod';

const VersionParams = z.object({
  templateId: z.string().min(1),
  version: z.string().regex(/^\d+$/),
});

export const bundleTemplateRouter: FastifyPluginAsync = async (
  fastify: FastifyInstance
) => {
  fastify.addHook('preHandler', userAuth);
  fastify.addHook('preHandler', requireFeature('bundles'));

  fastify.post(
    '/',
    {
      schema: {
        tags: ['Bundle Templates'],
        summary: 'Create a bundle template',
        description: 'Creates a new bundle template in draft status.',
        security: bearerSecurity,
        body: CreateBundleTemplateBody,
        response: { 201: ApiSuccessSchema, ...errorResponses },
      },
    },
    bundleTemplateController.create.bind(bundleTemplateController)
  );

  fastify.get(
    '/',
    {
      schema: {
        tags: ['Bundle Templates'],
        summary: 'List bundle templates',
        description: 'Lists all bundle templates for the organisation.',
        security: bearerSecurity,
        querystring: BundleTemplateListQuery,
        response: { 200: ApiSuccessSchema, ...errorResponses },
      },
    },
    bundleTemplateController.list.bind(bundleTemplateController)
  );

  fastify.get(
    '/:templateId',
    {
      schema: {
        tags: ['Bundle Templates'],
        summary: 'Get a bundle template',
        description: 'Retrieves a bundle template by ID.',
        security: bearerSecurity,
        params: BundleTemplateIdParams,
        response: { 200: ApiSuccessSchema, ...errorResponses },
      },
    },
    bundleTemplateController.get.bind(bundleTemplateController)
  );

  fastify.patch(
    '/:templateId',
    {
      schema: {
        tags: ['Bundle Templates'],
        summary: 'Update a bundle template',
        description: 'Updates a bundle template draft.',
        security: bearerSecurity,
        params: BundleTemplateIdParams,
        body: UpdateBundleTemplateBody,
        response: { 200: ApiSuccessSchema, ...errorResponses },
      },
    },
    bundleTemplateController.update.bind(bundleTemplateController)
  );

  fastify.delete(
    '/:templateId',
    {
      schema: {
        tags: ['Bundle Templates'],
        summary: 'Delete a bundle template',
        description: 'Soft-deletes a bundle template.',
        security: bearerSecurity,
        params: BundleTemplateIdParams,
        response: { 200: ApiSuccessSchema, ...errorResponses },
      },
    },
    bundleTemplateController.delete.bind(bundleTemplateController)
  );

  fastify.post(
    '/:templateId/publish',
    {
      schema: {
        tags: ['Bundle Templates'],
        summary: 'Publish a bundle template',
        description:
          'Creates an immutable version snapshot and marks the template as published.',
        security: bearerSecurity,
        params: BundleTemplateIdParams,
        body: PublishTemplateBody,
        response: { 200: ApiSuccessSchema, ...errorResponses },
      },
    },
    bundleTemplateController.publish.bind(bundleTemplateController)
  );

  fastify.get(
    '/:templateId/versions',
    {
      schema: {
        tags: ['Bundle Templates'],
        summary: 'List template versions',
        description: 'Lists all published versions of a template.',
        security: bearerSecurity,
        params: BundleTemplateIdParams,
        response: { 200: ApiSuccessSchema, ...errorResponses },
      },
    },
    bundleTemplateController.listVersions.bind(bundleTemplateController)
  );

  fastify.get(
    '/:templateId/versions/:version',
    {
      schema: {
        tags: ['Bundle Templates'],
        summary: 'Get a template version',
        description: 'Retrieves a specific published version snapshot.',
        security: bearerSecurity,
        params: VersionParams,
        response: { 200: ApiSuccessSchema, ...errorResponses },
      },
    },
    bundleTemplateController.getVersion.bind(bundleTemplateController)
  );

  fastify.post(
    '/:templateId/clone',
    {
      schema: {
        tags: ['Bundle Templates'],
        summary: 'Clone a bundle template',
        description:
          'Creates a copy of a template (including example templates).',
        security: bearerSecurity,
        params: BundleTemplateIdParams,
        body: CloneTemplateBody,
        response: { 201: ApiSuccessSchema, ...errorResponses },
      },
    },
    bundleTemplateController.clone.bind(bundleTemplateController)
  );
};

export default bundleTemplateRouter;
