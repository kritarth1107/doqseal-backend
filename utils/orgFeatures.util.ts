/**
 * Organisation feature flags.
 *
 * Case packs (bundles) are on for every organisation. The per-organisation
 * kill switch is `features.bundlesDisabled: true`. The older
 * `features.bundles` boolean is not read for this: the schema and the 001
 * backfill wrote `bundles: false` into every organisation as a default, so a
 * stored `false` does not mean anyone switched the feature off.
 *
 * Other features stay opt-in (`features.<name> === true`).
 */
export type OrgFeatureName = 'bundles' | 'esign';

export type OrgFeatures =
  | {
      bundles?: boolean;
      bundlesDisabled?: boolean;
      esign?: boolean;
      [key: string]: unknown;
    }
  | null
  | undefined;

export function isOrgFeatureEnabled(features: OrgFeatures, feature: OrgFeatureName): boolean {
  if (feature === 'bundles') return features?.bundlesDisabled !== true;
  return features?.[feature] === true;
}

/** Feature flags as the dashboard sees them in the user profile. */
export function profileFeatures(features: OrgFeatures): { bundles: boolean } {
  return { bundles: isOrgFeatureEnabled(features, 'bundles') };
}
