import { FastifyRequest, FastifyReply } from 'fastify';
import Organisation from '../model/organisation.model';
import { resolveOrganisationId } from '../utils/org-access.util';
import { FeatureDisabledError } from '../utils/errors.util';

export type FeatureName = 'bundles' | 'esign';

/**
 * Creates a preHandler that checks if a feature is enabled for the organisation.
 * Returns 403 if the feature is not enabled.
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

    const features = (org as any).features as
      | Record<string, boolean>
      | undefined;
    const isEnabled = features?.[feature] === true;

    if (!isEnabled) {
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

  const features = (org as any).features as Record<string, boolean> | undefined;
  return features?.[feature] === true;
}
