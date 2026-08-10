import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import membershipController from '../controller/membership.controller';
import userAuth from '../middleware/user.auth';

export const inviteRouter: FastifyPluginAsync = async (
  fastify: FastifyInstance
) => {
  fastify.addHook('preHandler', userAuth);

  fastify.post('/:token/accept', membershipController.acceptInvite);
};

export default inviteRouter;
