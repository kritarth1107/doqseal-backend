import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import envelopeController from '../controller/envelope.controller';
import userAuth from '../middleware/user.auth';
import {
  ApiSuccessSchema,
  CreateEnvelopeBody,
  EnvelopeIdParams,
  bearerSecurity,
  errorResponses,
} from '../openapi/schemas';

export const envelopeRouter: FastifyPluginAsync = async (
  fastify: FastifyInstance
) => {
  fastify.addHook('preHandler', userAuth);

  fastify.post(
    '/',
    {
      schema: {
        tags: ['Envelopes'],
        summary: 'Create envelope',
        security: bearerSecurity,
        body: CreateEnvelopeBody,
        response: { 200: ApiSuccessSchema, ...errorResponses },
      },
    },
    envelopeController.create
  );

  fastify.get(
    '/',
    {
      schema: {
        tags: ['Envelopes'],
        summary: 'List envelopes',
        security: bearerSecurity,
        response: { 200: ApiSuccessSchema, ...errorResponses },
      },
    },
    envelopeController.list
  );

  fastify.get(
    '/:id',
    {
      schema: {
        tags: ['Envelopes'],
        summary: 'Get envelope',
        security: bearerSecurity,
        params: EnvelopeIdParams,
        response: { 200: ApiSuccessSchema, ...errorResponses },
      },
    },
    envelopeController.getOne
  );

  fastify.post(
    '/:id/send',
    {
      schema: {
        tags: ['Envelopes'],
        summary: 'Send envelope to signers',
        security: bearerSecurity,
        params: EnvelopeIdParams,
        response: { 200: ApiSuccessSchema, ...errorResponses },
      },
    },
    envelopeController.send
  );
};

export default envelopeRouter;
