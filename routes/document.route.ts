import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import documentController from '../controller/document.controller';
import userAuth from '../middleware/user.auth';
import {
  ApiSuccessSchema,
  DocumentIdParams,
  DocumentListQuery,
  bearerSecurity,
  errorResponses,
} from '../openapi/schemas';

export const documentRouter: FastifyPluginAsync = async (
  fastify: FastifyInstance
) => {
  fastify.addHook('preHandler', userAuth);

  fastify.post(
    '/upload',
    {
      schema: {
        tags: ['Documents'],
        summary: 'Upload document (multipart)',
        description:
          'multipart/form-data with file field plus project metadata. Use a multipart client.',
        security: bearerSecurity,
        response: { 200: ApiSuccessSchema, ...errorResponses },
      },
    },
    documentController.upload
  );

  fastify.get(
    '/',
    {
      schema: {
        tags: ['Documents'],
        summary: 'List documents',
        security: bearerSecurity,
        querystring: DocumentListQuery,
        response: { 200: ApiSuccessSchema, ...errorResponses },
      },
    },
    documentController.list
  );

  fastify.get(
    '/:documentId/file',
    {
      schema: {
        tags: ['Documents'],
        summary: 'Download document file',
        security: bearerSecurity,
        params: DocumentIdParams,
        response: { 200: ApiSuccessSchema, ...errorResponses },
      },
    },
    documentController.downloadFile
  );

  fastify.delete(
    '/:documentId',
    {
      schema: {
        tags: ['Documents'],
        summary: 'Delete document',
        security: bearerSecurity,
        params: DocumentIdParams,
        response: { 200: ApiSuccessSchema, ...errorResponses },
      },
    },
    documentController.deleteOne
  );

  fastify.post(
    '/:documentId/reprocess',
    {
      schema: {
        tags: ['Documents'],
        summary: 'Re-run extraction for a document',
        security: bearerSecurity,
        params: DocumentIdParams,
        response: { 200: ApiSuccessSchema, ...errorResponses },
      },
    },
    documentController.reprocess
  );

  fastify.get(
    '/:documentId',
    {
      schema: {
        tags: ['Documents'],
        summary: 'Get document metadata',
        security: bearerSecurity,
        params: DocumentIdParams,
        response: { 200: ApiSuccessSchema, ...errorResponses },
      },
    },
    documentController.getOne
  );
};

export default documentRouter;
