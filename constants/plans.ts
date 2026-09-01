/** DoqSeal subscription plans (INR). Custom pricing is per-org via planDetails. */

export type PlanId = 'free' | 'starter' | 'growth' | 'scale' | 'custom';

export type PlanLimits = {
  id: PlanId;
  name: string;
  priceInrMonthly: number | null;
  storageLimitBytes: number;
  monthlyExtractionLimit: number;
  /** null = unlimited */
  dailyApiRequestLimit: number | null;
  /** Min file retention days before binary can be purged (context kept) */
  minRetentionDays: number;
  defaultRetentionDays: number;
  /** INR charged per retained document per day while binary is stored */
  storageDayRateInr: number;
  contactSales?: boolean;
};

/** ₹0.12 per document per day while the original file is retained */
export const STORAGE_DAY_RATE_INR = 0.12;
export const MIN_RETENTION_DAYS = 15;
export const DEFAULT_RETENTION_DAYS = 15;

export const PLANS: Record<Exclude<PlanId, 'custom'>, PlanLimits> = {
  free: {
    id: 'free',
    name: 'Free',
    priceInrMonthly: 0,
    storageLimitBytes: 5 * 1024 * 1024, // 5 MB
    monthlyExtractionLimit: 2,
    dailyApiRequestLimit: 0,
    minRetentionDays: MIN_RETENTION_DAYS,
    defaultRetentionDays: DEFAULT_RETENTION_DAYS,
    storageDayRateInr: STORAGE_DAY_RATE_INR,
  },
  starter: {
    id: 'starter',
    name: 'Starter',
    priceInrMonthly: 999,
    storageLimitBytes: 100 * 1024 * 1024, // 100 MB
    monthlyExtractionLimit: 500,
    dailyApiRequestLimit: 10_000,
    minRetentionDays: MIN_RETENTION_DAYS,
    defaultRetentionDays: DEFAULT_RETENTION_DAYS,
    storageDayRateInr: STORAGE_DAY_RATE_INR,
  },
  growth: {
    id: 'growth',
    name: 'Growth',
    priceInrMonthly: 2099,
    storageLimitBytes: 500 * 1024 * 1024, // 500 MB
    monthlyExtractionLimit: 1500,
    dailyApiRequestLimit: 50_000,
    minRetentionDays: MIN_RETENTION_DAYS,
    defaultRetentionDays: DEFAULT_RETENTION_DAYS,
    storageDayRateInr: STORAGE_DAY_RATE_INR,
  },
  scale: {
    id: 'scale',
    name: 'Scale',
    priceInrMonthly: 3999,
    storageLimitBytes: 5 * 1024 * 1024 * 1024, // 5 GB
    monthlyExtractionLimit: 5000,
    dailyApiRequestLimit: null, // unlimited
    minRetentionDays: MIN_RETENTION_DAYS,
    defaultRetentionDays: DEFAULT_RETENTION_DAYS,
    storageDayRateInr: STORAGE_DAY_RATE_INR,
  },
};

export const FREE_PLAN = PLANS.free;

export function resolvePlanLimits(planDetails?: {
  planId?: string;
  storageLimitBytes?: number;
  monthlyExtractionLimit?: number;
  dailyApiRequestLimit?: number | null;
  extractionPriceInr?: number | null;
  contactSales?: boolean;
}): PlanLimits {
  const planId = (planDetails?.planId || 'free') as PlanId;

  if (planId === 'custom') {
    return {
      id: 'custom',
      name: 'Custom',
      priceInrMonthly: null,
      storageLimitBytes:
        typeof planDetails?.storageLimitBytes === 'number'
          ? planDetails.storageLimitBytes
          : PLANS.scale.storageLimitBytes,
      monthlyExtractionLimit:
        typeof planDetails?.monthlyExtractionLimit === 'number'
          ? planDetails.monthlyExtractionLimit
          : PLANS.scale.monthlyExtractionLimit,
      dailyApiRequestLimit:
        planDetails?.dailyApiRequestLimit === undefined
          ? null
          : planDetails.dailyApiRequestLimit,
      minRetentionDays: MIN_RETENTION_DAYS,
      defaultRetentionDays: DEFAULT_RETENTION_DAYS,
      storageDayRateInr: STORAGE_DAY_RATE_INR,
      contactSales: true,
    };
  }

  if (planId in PLANS) {
    return PLANS[planId as Exclude<PlanId, 'custom'>];
  }

  return FREE_PLAN;
}

export function listPublicPlans() {
  return [
    PLANS.free,
    PLANS.starter,
    PLANS.growth,
    PLANS.scale,
    {
      id: 'custom' as const,
      name: 'Custom',
      priceInrMonthly: null,
      storageLimitBytes: null,
      monthlyExtractionLimit: null,
      dailyApiRequestLimit: null,
      minRetentionDays: MIN_RETENTION_DAYS,
      defaultRetentionDays: DEFAULT_RETENTION_DAYS,
      storageDayRateInr: STORAGE_DAY_RATE_INR,
      contactSales: true,
      description:
        'Per-extraction pricing + ₹0.12/doc/day. Available on contact request.',
    },
  ];
}
