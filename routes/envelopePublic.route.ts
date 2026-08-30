import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import envelopeController from '../controller/envelope.controller';
import {
  ApiSuccessSchema,
  EnvelopeTokenParams,
  SignEnvelopeBody,
  errorResponses,
} from '../openapi/schemas';

export const envelopePublicRouter: FastifyPluginAsync = async (
  fastify: FastifyInstance
) => {
  fastify.get(
    '/public/:token',
    {
      schema: {
        tags: ['Envelopes Public'],
        summary: 'Get envelope by public token',
        params: EnvelopeTokenParams,
        response: { 200: ApiSuccessSchema, ...errorResponses },
      },
    },
    envelopeController.getByToken
  );

  fastify.get(
    '/public/:token/file',
    {
      schema: {
        tags: ['Envelopes Public'],
        summary: 'Download envelope file by public token',
        params: EnvelopeTokenParams,
        response: { 200: ApiSuccessSchema, ...errorResponses },
      },
    },
    envelopeController.getFileByToken
  );

  fastify.post(
    '/public/:token/sign',
    {
      schema: {
        tags: ['Envelopes Public'],
        summary: 'Submit signature for public envelope',
        params: EnvelopeTokenParams,
        body: SignEnvelopeBody,
        response: { 200: ApiSuccessSchema, ...errorResponses },
      },
    },
    envelopeController.sign
  );
};

export default envelopePublicRouter;
