import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import bundleController from '../controller/bundle.controller';
import userAuth from '../middleware/user.auth';
import { requireFeature } from '../middleware/featureFlag.middleware';
import {
  ApiSuccessSchema,
  bearerSecurity,
  errorResponses,
} from '../openapi/schemas';
import {
  CreateBundleBody,
  UpdateBundleBody,
  BundleIdParams,
  BundleListQuery,
  DeleteBundleQuery,
  AttachDocumentsBody,
  BundleDocumentParams,
  UpdateBundleDocumentBody,
  CreateBundleRunBody,
  BundleRunIdParams,
} from '../openapi/bundle.schemas';

export const bundleRouter: FastifyPluginAsync = async (
  fastify: FastifyInstance
) => {
  fastify.addHook('preHandler', userAuth);
  fastify.addHook('preHandler', requireFeature('bundles'));

  fastify.post(
    '/',
    {
      schema: {
        tags: ['Bundles'],
        summary: 'Create a bundle',
        description:
          'Creates a new bundle from a template. Idempotent on externalRef.',
        security: bearerSecurity,
        body: CreateBundleBody,
        response: { 201: ApiSuccessSchema, ...errorResponses },
      },
    },
    bundleController.create.bind(bundleController)
  );

  fastify.get(
    '/',
    {
      schema: {
        tags: ['Bundles'],
        summary: 'List bundles',
        description: 'Lists all bundles with filters and pagination.',
        security: bearerSecurity,
        querystring: BundleListQuery,
        response: { 200: ApiSuccessSchema, ...errorResponses },
      },
    },
    bundleController.list.bind(bundleController)
  );

  fastify.get(
    '/:bundleId',
    {
      schema: {
        tags: ['Bundles'],
        summary: 'Get a bundle',
        description: 'Retrieves a bundle with documents and latest run.',
        security: bearerSecurity,
        params: BundleIdParams,
        response: { 200: ApiSuccessSchema, ...errorResponses },
      },
    },
    bundleController.get.bind(bundleController)
  );

  fastify.patch(
    '/:bundleId',
    {
      schema: {
        tags: ['Bundles'],
        summary: 'Update a bundle',
        description: 'Updates bundle profile, assignees, or tags.',
        security: bearerSecurity,
        params: BundleIdParams,
        body: UpdateBundleBody,
        response: { 200: ApiSuccessSchema, ...errorResponses },
      },
    },
    bundleController.update.bind(bundleController)
  );

  fastify.delete(
    '/:bundleId',
    {
      schema: {
        tags: ['Bundles'],
        summary: 'Delete a bundle',
        description: 'Soft-deletes a bundle. mode=cascade removes documents.',
        security: bearerSecurity,
        params: BundleIdParams,
        querystring: DeleteBundleQuery,
        response: { 200: ApiSuccessSchema, ...errorResponses },
      },
    },
    bundleController.delete.bind(bundleController)
  );

  fastify.post(
    '/:bundleId/documents',
    {
      schema: {
        tags: ['Bundles'],
        summary: 'Attach existing documents',
        description: 'Attaches existing org documents to the bundle.',
        security: bearerSecurity,
        params: BundleIdParams,
        body: AttachDocumentsBody,
        response: { 200: ApiSuccessSchema, ...errorResponses },
      },
    },
    bundleController.attachDocuments.bind(bundleController)
  );

  fastify.post(
    '/:bundleId/upload',
    {
      schema: {
        tags: ['Bundles'],
        summary: 'Upload a document to the bundle',
        description:
          'Uploads a new document directly to the bundle (multipart).',
        security: bearerSecurity,
        params: BundleIdParams,
        response: { 201: ApiSuccessSchema, ...errorResponses },
      },
    },
    bundleController.uploadDocument.bind(bundleController)
  );

  fastify.patch(
    '/:bundleId/documents/:documentId',
    {
      schema: {
        tags: ['Bundles'],
        summary: 'Reassign document type',
        description: 'Changes the assigned type key of a bundle document.',
        security: bearerSecurity,
        params: BundleDocumentParams,
        body: UpdateBundleDocumentBody,
        response: { 200: ApiSuccessSchema, ...errorResponses },
      },
    },
    bundleController.updateDocument.bind(bundleController)
  );

  fastify.delete(
    '/:bundleId/documents/:documentId',
    {
      schema: {
        tags: ['Bundles'],
        summary: 'Remove a document from bundle',
        description: 'Removes a document from the bundle (does not delete it).',
        security: bearerSecurity,
        params: BundleDocumentParams,
        response: { 200: ApiSuccessSchema, ...errorResponses },
      },
    },
    bundleController.removeDocument.bind(bundleController)
  );

  fastify.post(
    '/:bundleId/run',
    {
      schema: {
        tags: ['Bundles'],
        summary: 'Start a bundle run',
        description:
          'Queues a bundle evaluation run. Returns 202 with runId.',
        security: bearerSecurity,
        params: BundleIdParams,
        body: CreateBundleRunBody,
        response: { 202: ApiSuccessSchema, ...errorResponses },
      },
    },
    bundleController.createRun.bind(bundleController)
  );

  fastify.get(
    '/:bundleId/runs',
    {
      schema: {
        tags: ['Bundles'],
        summary: 'List bundle runs',
        description: 'Lists all runs for a bundle.',
        security: bearerSecurity,
        params: BundleIdParams,
        response: { 200: ApiSuccessSchema, ...errorResponses },
      },
    },
    bundleController.listRuns.bind(bundleController)
  );

  fastify.get(
    '/:bundleId/runs/:runId',
    {
      schema: {
        tags: ['Bundles'],
        summary: 'Get a bundle run',
        description:
          'Retrieves a run with checklist, exceptions, and record.',
        security: bearerSecurity,
        params: BundleRunIdParams,
        response: { 200: ApiSuccessSchema, ...errorResponses },
      },
    },
    bundleController.getRun.bind(bundleController)
  );
};

export default bundleRouter;
