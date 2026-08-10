import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import membershipController from '../controller/membership.controller';
import userAuth from '../middleware/user.auth';

export const membershipRouter: FastifyPluginAsync = async (
  fastify: FastifyInstance
) => {
  fastify.addHook('preHandler', userAuth);

  fastify.post('/:id/invites', membershipController.createInvite);
  fastify.get('/:id/invites', membershipController.listInvites);
  fastify.delete('/:id/invites/:inviteId', membershipController.revokeInvite);
  fastify.patch('/:id/members/:userId', membershipController.updateMemberRole);
  fastify.delete('/:id/members/:userId', membershipController.removeMember);
};

export default membershipRouter;
