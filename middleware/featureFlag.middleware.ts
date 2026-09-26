import { FastifyRequest, FastifyReply } from 'fastify';
import Organisation from '../model/organisation.model';
import { resolveOrganisationId } from '../utils/org-access.util';
import { FeatureDisabledError } from '../utils/errors.util';
import { isOrgFeatureEnabled, type OrgFeatures } from '../utils/orgFeatures.util';

export type FeatureName = 'bundles' | 'esign';

/**
 * Creates a preHandler that checks if a feature is enabled for the organisation
 * (see utils/orgFeatures.util.ts for the defaults). Returns 403 if it is not.
 */
export function requireFeature(feature: FeatureName) {
  return async function featureFlagHandler(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    const organisationId = resolveOrganisationId(request);

    const org = await Organisation.findOne({
      publicId: organisationId,
      deletedAt: null,
    }).lean();

    if (!org) {
      throw new FeatureDisabledError(feature);
    }

    if (!isOrgFeatureEnabled((org as any).features as OrgFeatures, feature)) {
      throw new FeatureDisabledError(feature);
    }
  };
}

/**
 * Checks if a feature is enabled for an organisation (non-throwing).
 * Returns true if enabled, false otherwise.
 */
export async function isFeatureEnabled(
  organisationId: string,
  feature: FeatureName
): Promise<boolean> {
  const org = await Organisation.findOne({
    publicId: organisationId,
    deletedAt: null,
  }).lean();

  if (!org) {
    return false;
  }

  return isOrgFeatureEnabled((org as any).features as OrgFeatures, feature);
}
