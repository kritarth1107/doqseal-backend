import User from '../model/user.model';

export async function assertUserInOrganisation(
  userId: string,
  organisationId: string
): Promise<void> {
  const user = await User.findOne({ userId, deletedAt: null }).lean();

  if (!user) {
    throw new Error('User not found');
  }

  const memberships = user.organisations || [];
  const isMember = memberships.some(
    (org) => org.organisationId === organisationId
  );

  if (!isMember) {
    throw new Error('You do not have access to this organisation');
  }
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