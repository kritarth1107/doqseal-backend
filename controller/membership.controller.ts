import { FastifyRequest, FastifyReply } from 'fastify';
import membershipService from '../service/membership.service';
import responseUtil from '../utils/response.util';
import { OrgRole } from '../utils/org-access.util';

export class MembershipController {
  public async createInvite(request: FastifyRequest, reply: FastifyReply) {
    const sessionUser = (request as any).user;
    const { id } = request.params as { id: string };
    const body = request.body as { email?: string; role?: OrgRole };

    try {
      if (!body.email) {
        return responseUtil.error(reply, 'Email is required', 400);
      }

      const invite = await membershipService.inviteMember(
        sessionUser.userId,
        id,
        body.email,
        body.role || 'member'
      );

      return responseUtil.success(
        reply,
        'Invite sent successfully',
        invite,
        201
      );
    } catch (error: any) {
      const status = error.message?.includes('Requires')
        ? 403
        : error.message?.includes('already')
          ? 409
          : 500;
      return responseUtil.error(
        reply,
        error.message || 'Failed to send invite',
        status
      );
    }
  }

  public async listInvites(request: FastifyRequest, reply: FastifyReply) {
    const sessionUser = (request as any).user;
    const { id } = request.params as { id: string };

    try {
      const invites = await membershipService.listInvites(
        sessionUser.userId,
        id
      );
      return responseUtil.success(
        reply,
        'Invites retrieved successfully',
        invites
      );
    } catch (error: any) {
      const status = error.message?.includes('Requires') ? 403 : 500;
      return responseUtil.error(
        reply,
        error.message || 'Failed to list invites',
        status
      );
    }
  }

  public async revokeInvite(request: FastifyRequest, reply: FastifyReply) {
    const sessionUser = (request as any).user;
    const { id, inviteId } = request.params as {
      id: string;
      inviteId: string;
    };

    try {
      const result = await membershipService.revokeInvite(
        sessionUser.userId,
        id,
        inviteId
      );
      return responseUtil.success(reply, 'Invite revoked successfully', result);
    } catch (error: any) {
      const status =
        error.message === 'Invite not found'
          ? 404
          : error.message?.includes('Requires')
            ? 403
            : 400;
      return responseUtil.error(
        reply,
        error.message || 'Failed to revoke invite',
        status
      );
    }
  }

  public async acceptInvite(request: FastifyRequest, reply: FastifyReply) {
    const sessionUser = (request as any).user;
    const { token } = request.params as { token: string };

    try {
      const result = await membershipService.acceptInvite(
        sessionUser.userId,
        token
      );
      return responseUtil.success(
        reply,
        'Invite accepted successfully',
        result
      );
    } catch (error: any) {
      const status =
        error.message === 'Invite not found'
          ? 404
          : error.message?.includes('match')
            ? 403
            : 400;
      return responseUtil.error(
        reply,
        error.message || 'Failed to accept invite',
        status
      );
    }
  }

  public async updateMemberRole(request: FastifyRequest, reply: FastifyReply) {
    const sessionUser = (request as any).user;
    const { id, userId } = request.params as { id: string; userId: string };
    const body = request.body as { role?: OrgRole };

    try {
      if (!body.role) {
        return responseUtil.error(reply, 'Role is required', 400);
      }

      const result = await membershipService.updateMemberRole(
        sessionUser.userId,
        id,
        userId,
        body.role
      );
      return responseUtil.success(
        reply,
        'Member role updated successfully',
        result
      );
    } catch (error: any) {
      const status =
        error.message === 'Member not found'
          ? 404
          : error.message?.includes('Requires')
            ? 403
            : 400;
      return responseUtil.error(
        reply,
        error.message || 'Failed to update member role',
        status
      );
    }
  }

  public async removeMember(request: FastifyRequest, reply: FastifyReply) {
    const sessionUser = (request as any).user;
    const { id, userId } = request.params as { id: string; userId: string };

    try {
      const result = await membershipService.removeMember(
        sessionUser.userId,
        id,
        userId
      );
      return responseUtil.success(reply, 'Member removed successfully', result);
    } catch (error: any) {
      const status =
        error.message === 'Member not found'
          ? 404
          : error.message?.includes('Requires')
            ? 403
            : 400;
      return responseUtil.error(
        reply,
        error.message || 'Failed to remove member',
        status
      );
    }
  }
}

export default new MembershipController();
