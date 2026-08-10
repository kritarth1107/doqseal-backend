import User from '../model/user.model';
import Organisation from '../model/organisation.model';
import Membership from '../model/membership.model';

export type OrgRole = 'owner' | 'admin' | 'member';

const ROLE_RANK: Record<OrgRole, number> = {
  owner: 3,
  admin: 2,
  member: 1,
};

export async function assertUserInOrganisation(
  userId: string,
  organisationId: string
): Promise<void> {
  await assertOrgRole(userId, organisationId, 'member');
}

export async function assertOrgRole(
  userId: string,
  organisationId: string,
  minRole: OrgRole
): Promise<{ role: OrgRole }> {
  const user = await User.findOne({ userId, deletedAt: null }).lean();

  if (!user) {
    throw new Error('User not found');
  }

  const organisation = await Organisation.findOne({
    publicId: organisationId,
    deletedAt: null,
  }).lean();

  if (!organisation) {
    throw new Error('Organisation not found');
  }

  const membership = await Membership.findOne({
    userId,
    organisationId: organisation._id,
    deletedAt: null,
  }).lean();

  if (!membership) {
    throw new Error('You do not have access to this organisation');
  }

  const userRank = ROLE_RANK[membership.role as OrgRole] ?? 0;
  const requiredRank = ROLE_RANK[minRole];

  if (userRank < requiredRank) {
    throw new Error(`Requires ${minRole} role or higher`);
  }

  return { role: membership.role as OrgRole };
}

export function resolveOrganisationId(
  request: { headers: Record<string, unknown> },
  bodyOrganisationId?: string
): string {
  const headerOrgId = request.headers['x-organisation-id'];
  const organisationId =
    (typeof headerOrgId === 'string' && headerOrgId) || bodyOrganisationId;

  if (!organisationId) {
    throw new Error('Organisation context required (x-organisation-id header)');
  }

  return organisationId;
}