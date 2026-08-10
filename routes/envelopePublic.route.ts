import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import envelopeController from '../controller/envelope.controller';

export const envelopePublicRouter: FastifyPluginAsync = async (
  fastify: FastifyInstance
) => {
  fastify.get('/public/:token', envelopeController.getByToken);
  fastify.get('/public/:token/file', envelopeController.getFileByToken);
  fastify.post('/public/:token/sign', envelopeController.sign);
};

export default envelopePublicRouter;
