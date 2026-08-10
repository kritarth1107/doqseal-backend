import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import envelopeController from '../controller/envelope.controller';
import userAuth from '../middleware/user.auth';

export const envelopeRouter: FastifyPluginAsync = async (
  fastify: FastifyInstance
) => {
  fastify.addHook('preHandler', userAuth);

  fastify.post('/', envelopeController.create);
  fastify.get('/', envelopeController.list);
  fastify.get('/:id', envelopeController.getOne);
  fastify.post('/:id/send', envelopeController.send);
};

export default envelopeRouter;
