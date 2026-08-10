import crypto from 'crypto';
import Organisation from '../model/organisation.model';
import OrganisationInvite from '../model/organisationInvite.model';
import Membership from '../model/membership.model';
import User from '../model/user.model';
import EmailUtil from '../utils/email.util';
import { assertOrgRole, OrgRole } from '../utils/org-access.util';
import auditService from './audit.service';
import config from '../config/app.config';

const INVITE_EXPIRY_DAYS = 7;

export class MembershipService {
  private async resolveOrganisation(orgId: string) {
    const organisation = await Organisation.findOne({
      publicId: orgId,
      deletedAt: null,
    });

    if (!organisation) {
      throw new Error('Organisation not found');
    }

    return organisation;
  }

  public async inviteMember(
    userId: string,
    orgId: string,
    email: string,
    role: OrgRole = 'member'
  ) {
    await assertOrgRole(userId, orgId, 'admin');

    const organisation = await this.resolveOrganisation(orgId);
    const normalizedEmail = email.trim().toLowerCase();

    if (!normalizedEmail) {
      throw new Error('Email is required');
    }

    const existingUser = await User.findOne({
      email: normalizedEmail,
      deletedAt: null,
    }).lean();

    if (existingUser) {
      const existingMembership = await Membership.findOne({
        userId: existingUser.userId,
        organisationId: organisation._id,
        deletedAt: null,
      }).lean();

      if (existingMembership) {
        throw new Error('User is already a member of this organisation');
      }
    }

    const pendingInvite = await OrganisationInvite.findOne({
      email: normalizedEmail,
      organisationId: organisation._id,
      status: 'pending',
      expiresAt: { $gt: new Date() },
    }).lean();

    if (pendingInvite) {
      throw new Error('An active invite already exists for this email');
    }

    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + INVITE_EXPIRY_DAYS);

    const invite = await OrganisationInvite.create({
      email: normalizedEmail,
      organisationId: organisation._id,
      role,
      token,
      invitedBy: userId,
      expiresAt,
      status: 'pending',
    });

    const acceptUrl = `${config.server.liveFrontendUrl}/invites/${token}/accept`;

    await EmailUtil.sendEmail({
      to: normalizedEmail,
      subject: `You've been invited to join ${organisation.name}`,
      html: `
        <p>You have been invited to join <strong>${organisation.name}</strong> as a <strong>${role}</strong>.</p>
        <p><a href="${acceptUrl}">Accept invitation</a></p>
        <p>This invite expires on ${expiresAt.toISOString()}.</p>
      `,
      text: `You have been invited to join ${organisation.name} as a ${role}. Accept: ${acceptUrl}`,
    });

    await auditService.logEvent({
      actorId: userId,
      organisationId: orgId,
      action: 'member.invite',
      resourceType: 'invite',
      resourceId: invite._id.toString(),
      metadata: {
        email: normalizedEmail,
        role,
        expiresAt,
      },
    });

    return {
      inviteId: invite._id.toString(),
      email: invite.email,
      role: invite.role,
      status: invite.status,
      expiresAt: invite.expiresAt,
      invitedBy: invite.invitedBy,
      createdAt: invite.createdAt,
    };
  }

  public async listInvites(userId: string, orgId: string) {
    await assertOrgRole(userId, orgId, 'admin');

    const organisation = await this.resolveOrganisation(orgId);

    const invites = await OrganisationInvite.find({
      organisationId: organisation._id,
      status: { $in: ['pending', 'accepted', 'revoked'] },
    })
      .sort({ createdAt: -1 })
      .lean();

    return invites.map((invite) => ({
      inviteId: invite._id.toString(),
      email: invite.email,
      role: invite.role,
      status: invite.status,
      invitedBy: invite.invitedBy,
      expiresAt: invite.expiresAt,
      createdAt: invite.createdAt,
    }));
  }

  public async revokeInvite(userId: string, orgId: string, inviteId: string) {
    await assertOrgRole(userId, orgId, 'admin');

    const organisation = await this.resolveOrganisation(orgId);

    const invite = await OrganisationInvite.findOne({
      _id: inviteId,
      organisationId: organisation._id,
    });

    if (!invite) {
      throw new Error('Invite not found');
    }

    if (invite.status !== 'pending') {
      throw new Error('Only pending invites can be revoked');
    }

    invite.status = 'revoked';
    await invite.save();

    await auditService.logEvent({
      actorId: userId,
      organisationId: orgId,
      action: 'member.invite_revoke',
      resourceType: 'invite',
      resourceId: invite._id.toString(),
      metadata: {
        email: invite.email,
        role: invite.role,
      },
    });

    return {
      inviteId: invite._id.toString(),
      status: invite.status,
    };
  }

  public async acceptInvite(userId: string, token: string) {
    const invite = await OrganisationInvite.findOne({ token });

    if (!invite) {
      throw new Error('Invite not found');
    }

    if (invite.status !== 'pending') {
      throw new Error('Invite is no longer valid');
    }

    if (invite.expiresAt < new Date()) {
      throw new Error('Invite has expired');
    }

    const user = await User.findOne({ userId, deletedAt: null });

    if (!user) {
      throw new Error('User not found');
    }

    if (user.email.toLowerCase() !== invite.email.toLowerCase()) {
      throw new Error('Invite email does not match your account');
    }

    const organisation = await Organisation.findById(invite.organisationId);

    if (!organisation || organisation.deletedAt) {
      throw new Error('Organisation not found');
    }

    const orgPublicId = organisation.publicId as string;

    const existingMembership = await Membership.findOne({
      userId,
      organisationId: organisation._id,
      deletedAt: null,
    }).lean();

    if (existingMembership) {
      throw new Error('You are already a member of this organisation');
    }

    await Membership.create({
      userId,
      organisationId: organisation._id,
      role: invite.role,
    });

    const organisations = user.organisations || [];
    organisations.push({
      organisationId: orgPublicId,
      role: invite.role,
    });
    user.organisations = organisations;
    await user.save();

    organisation.memberCount = (organisation.memberCount || 0) + 1;
    await organisation.save();

    invite.status = 'accepted';
    await invite.save();

    await auditService.logEvent({
      actorId: userId,
      organisationId: orgPublicId,
      action: 'member.invite_accept',
      resourceType: 'invite',
      resourceId: invite._id.toString(),
      metadata: {
        email: invite.email,
        role: invite.role,
      },
    });

    return {
      organisationId: orgPublicId,
      organisationName: organisation.name,
      role: invite.role,
    };
  }

  public async updateMemberRole(
    actorId: string,
    orgId: string,
    targetUserId: string,
    role: OrgRole
  ) {
    await assertOrgRole(actorId, orgId, 'admin');

    const organisation = await this.resolveOrganisation(orgId);

    const membership = await Membership.findOne({
      userId: targetUserId,
      organisationId: organisation._id,
      deletedAt: null,
    });

    if (!membership) {
      throw new Error('Member not found');
    }

    if (membership.role === 'owner' && role !== 'owner') {
      const ownerCount = await Membership.countDocuments({
        organisationId: organisation._id,
        role: 'owner',
        deletedAt: null,
      });

      if (ownerCount <= 1) {
        throw new Error('Cannot change role of the last owner');
      }
    }

    membership.role = role;
    await membership.save();

    await User.updateOne(
      {
        userId: targetUserId,
        'organisations.organisationId': orgId,
      },
      {
        $set: { 'organisations.$.role': role },
      }
    );

    await auditService.logEvent({
      actorId,
      organisationId: orgId,
      action: 'member.role_update',
      resourceType: 'member',
      resourceId: targetUserId,
      metadata: { role },
    });

    return {
      userId: targetUserId,
      role,
    };
  }

  public async removeMember(
    actorId: string,
    orgId: string,
    targetUserId: string
  ) {
    await assertOrgRole(actorId, orgId, 'admin');

    if (actorId === targetUserId) {
      throw new Error('You cannot remove yourself');
    }

    const organisation = await this.resolveOrganisation(orgId);

    const membership = await Membership.findOne({
      userId: targetUserId,
      organisationId: organisation._id,
      deletedAt: null,
    });

    if (!membership) {
      throw new Error('Member not found');
    }

    if (membership.role === 'owner') {
      const ownerCount = await Membership.countDocuments({
        organisationId: organisation._id,
        role: 'owner',
        deletedAt: null,
      });

      if (ownerCount <= 1) {
        throw new Error('Cannot remove the last owner');
      }
    }

    membership.deletedAt = new Date();
    await membership.save();

    await User.updateOne(
      { userId: targetUserId },
      {
        $pull: {
          organisations: { organisationId: orgId },
        },
      }
    );

    organisation.memberCount = Math.max((organisation.memberCount || 1) - 1, 0);
    await organisation.save();

    await auditService.logEvent({
      actorId,
      organisationId: orgId,
      action: 'member.remove',
      resourceType: 'member',
      resourceId: targetUserId,
      metadata: {
        removedRole: membership.role,
      },
    });

    return {
      userId: targetUserId,
      removed: true,
    };
  }
}

export default new MembershipService();
