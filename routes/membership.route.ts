import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import membershipController from '../controller/membership.controller';
import userAuth from '../middleware/user.auth';
import {
  ApiSuccessSchema,
  CreateInviteBody,
  InviteIdParams,
  MemberParams,
  OrgIdParams,
  UpdateMemberBody,
  bearerSecurity,
  errorResponses,
} from '../openapi/schemas';

export const membershipRouter: FastifyPluginAsync = async (
  fastify: FastifyInstance
) => {
  fastify.addHook('preHandler', userAuth);

  fastify.post(
    '/:id/invites',
    {
      schema: {
        tags: ['Membership'],
        summary: 'Invite member by email',
        security: bearerSecurity,
        params: OrgIdParams,
        body: CreateInviteBody,
        response: { 200: ApiSuccessSchema, ...errorResponses },
      },
    },
    membershipController.createInvite
  );

  fastify.get(
    '/:id/invites',
    {
      schema: {
        tags: ['Membership'],
        summary: 'List pending invites',
        security: bearerSecurity,
        params: OrgIdParams,
        response: { 200: ApiSuccessSchema, ...errorResponses },
      },
    },
    membershipController.listInvites
  );

  fastify.delete(
    '/:id/invites/:inviteId',
    {
      schema: {
        tags: ['Membership'],
        summary: 'Revoke invite',
        security: bearerSecurity,
        params: InviteIdParams,
        response: { 200: ApiSuccessSchema, ...errorResponses },
      },
    },
    membershipController.revokeInvite
  );

  fastify.patch(
    '/:id/members/:userId',
    {
      schema: {
        tags: ['Membership'],
        summary: 'Update member role',
        security: bearerSecurity,
        params: MemberParams,
        body: UpdateMemberBody,
        response: { 200: ApiSuccessSchema, ...errorResponses },
      },
    },
    membershipController.updateMemberRole
  );

  fastify.delete(
    '/:id/members/:userId',
    {
      schema: {
        tags: ['Membership'],
        summary: 'Remove member',
        security: bearerSecurity,
        params: MemberParams,
        response: { 200: ApiSuccessSchema, ...errorResponses },
      },
    },
    membershipController.removeMember
  );
};

export default membershipRouter;
