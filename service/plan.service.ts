import Plan, { IPlan } from '../model/plan.model';
import {
  FREE_PLAN,
  PLANS,
  STORAGE_DAY_RATE_INR,
  type PlanLimits,
} from '../constants/plans';

export type PlanDto = {
  id: string;
  name: string;
  tagline: string;
  description: string;
  priceInrMonthly: number | null;
  storageLimitBytes: number | null;
  monthlyExtractionLimit: number | null;
  dailyApiRequestLimit: number | null;
  storageDayRateInr: number;
  minRetentionDays: number;
  defaultRetentionDays: number;
  features: string[];
  contactSales: boolean;
  highlighted: boolean;
  sortOrder: number;
};

type DefaultPlanRow = PlanDto & { planId: string };

const DEFAULT_PLANS: DefaultPlanRow[] = [
  {
    planId: 'free',
    id: 'free',
    name: 'Free',
    tagline: 'Try DoqSeal with limited storage and extractions',
    description: '',
    priceInrMonthly: 0,
    storageLimitBytes: 5 * 1024 * 1024,
    monthlyExtractionLimit: 2,
    dailyApiRequestLimit: 0,
    storageDayRateInr: STORAGE_DAY_RATE_INR,
    minRetentionDays: 15,
    defaultRetentionDays: 15,
    features: [
      '5 MB document storage',
      '2 AI extractions / month',
      'No API access',
      `₹${STORAGE_DAY_RATE_INR}/doc/day while file stored`,
    ],
    contactSales: false,
    highlighted: false,
    sortOrder: 0,
  },
  {
    planId: 'starter',
    id: 'starter',
    name: 'Starter',
    tagline: 'Small teams getting started with document AI',
    description: '',
    priceInrMonthly: 999,
    storageLimitBytes: 100 * 1024 * 1024,
    monthlyExtractionLimit: 500,
    dailyApiRequestLimit: 10_000,
    storageDayRateInr: STORAGE_DAY_RATE_INR,
    minRetentionDays: 15,
    defaultRetentionDays: 15,
    features: [
      '100 MB document storage',
      '500 AI extractions / month',
      '10,000 API requests / day',
      `₹${STORAGE_DAY_RATE_INR}/doc/day while file stored`,
    ],
    contactSales: false,
    highlighted: false,
    sortOrder: 1,
  },
  {
    planId: 'growth',
    id: 'growth',
    name: 'Growth',
    tagline: 'Growing teams with higher limits and API access',
    description: '',
    priceInrMonthly: 2099,
    storageLimitBytes: 500 * 1024 * 1024,
    monthlyExtractionLimit: 1500,
    dailyApiRequestLimit: 50_000,
    storageDayRateInr: STORAGE_DAY_RATE_INR,
    minRetentionDays: 15,
    defaultRetentionDays: 15,
    features: [
      '500 MB document storage',
      '1,500 AI extractions / month',
      '50,000 API requests / day',
      `₹${STORAGE_DAY_RATE_INR}/doc/day while file stored`,
    ],
    contactSales: false,
    highlighted: true,
    sortOrder: 2,
  },
  {
    planId: 'scale',
    id: 'scale',
    name: 'Scale',
    tagline: 'High-volume extraction and unlimited API',
    description: '',
    priceInrMonthly: 3999,
    storageLimitBytes: 5 * 1024 * 1024 * 1024,
    monthlyExtractionLimit: 5000,
    dailyApiRequestLimit: null,
    storageDayRateInr: STORAGE_DAY_RATE_INR,
    minRetentionDays: 15,
    defaultRetentionDays: 15,
    features: [
      '5 GB document storage',
      '5,000 AI extractions / month',
      'Unlimited API requests / day',
      `₹${STORAGE_DAY_RATE_INR}/doc/day while file stored`,
    ],
    contactSales: false,
    highlighted: false,
    sortOrder: 3,
  },
  {
    planId: 'custom',
    id: 'custom',
    name: 'Custom',
    tagline: 'Enterprise pricing tailored to your workflow',
    description:
      'Per-extraction pricing + ₹0.12/doc/day. Available on contact request.',
    priceInrMonthly: null,
    storageLimitBytes: null,
    monthlyExtractionLimit: null,
    dailyApiRequestLimit: null,
    storageDayRateInr: STORAGE_DAY_RATE_INR,
    minRetentionDays: 15,
    defaultRetentionDays: 15,
    features: [
      'Custom extraction pricing',
      'Flexible storage & API limits',
      'Dedicated support',
      `₹${STORAGE_DAY_RATE_INR}/doc/day storage metering`,
    ],
    contactSales: true,
    highlighted: false,
    sortOrder: 4,
  },
];

function docToDto(doc: IPlan | Record<string, unknown>): PlanDto {
  const d = doc as IPlan;
  return {
    id: d.planId,
    name: d.name,
    tagline: d.tagline || '',
    description: d.description || '',
    priceInrMonthly: d.priceInrMonthly ?? null,
    storageLimitBytes: d.storageLimitBytes ?? null,
    monthlyExtractionLimit: d.monthlyExtractionLimit ?? null,
    dailyApiRequestLimit: d.dailyApiRequestLimit ?? null,
    storageDayRateInr: d.storageDayRateInr ?? STORAGE_DAY_RATE_INR,
    minRetentionDays: d.minRetentionDays ?? 15,
    defaultRetentionDays: d.defaultRetentionDays ?? 15,
    features: Array.isArray(d.features) ? d.features : [],
    contactSales: Boolean(d.contactSales),
    highlighted: Boolean(d.highlighted),
    sortOrder: d.sortOrder ?? 0,
  };
}

function dtoToLimits(dto: PlanDto): PlanLimits {
  if (dto.id === 'custom') {
    return {
      id: 'custom',
      name: dto.name,
      priceInrMonthly: null,
      storageLimitBytes:
        dto.storageLimitBytes ?? PLANS.scale.storageLimitBytes,
      monthlyExtractionLimit:
        dto.monthlyExtractionLimit ?? PLANS.scale.monthlyExtractionLimit,
      dailyApiRequestLimit: dto.dailyApiRequestLimit ?? null,
      minRetentionDays: dto.minRetentionDays,
      defaultRetentionDays: dto.defaultRetentionDays,
      storageDayRateInr: dto.storageDayRateInr,
      contactSales: true,
    };
  }

  return {
    id: dto.id as PlanLimits['id'],
    name: dto.name,
    priceInrMonthly: dto.priceInrMonthly ?? 0,
    storageLimitBytes: dto.storageLimitBytes ?? FREE_PLAN.storageLimitBytes,
    monthlyExtractionLimit:
      dto.monthlyExtractionLimit ?? FREE_PLAN.monthlyExtractionLimit,
    dailyApiRequestLimit: dto.dailyApiRequestLimit ?? 0,
    minRetentionDays: dto.minRetentionDays,
    defaultRetentionDays: dto.defaultRetentionDays,
    storageDayRateInr: dto.storageDayRateInr,
    contactSales: dto.contactSales,
  };
}

export class PlanService {
  /** Upsert default catalog on startup. */
  public async seedDefaultPlans(): Promise<number> {
    let upserted = 0;
    for (const row of DEFAULT_PLANS) {
      await Plan.findOneAndUpdate(
        { planId: row.planId },
        {
          $set: {
            name: row.name,
            tagline: row.tagline,
            description: row.description,
            priceInrMonthly: row.priceInrMonthly,
            storageLimitBytes: row.storageLimitBytes,
            monthlyExtractionLimit: row.monthlyExtractionLimit,
            dailyApiRequestLimit: row.dailyApiRequestLimit,
            storageDayRateInr: row.storageDayRateInr,
            minRetentionDays: row.minRetentionDays,
            defaultRetentionDays: row.defaultRetentionDays,
            features: row.features,
            contactSales: row.contactSales,
            highlighted: row.highlighted,
            sortOrder: row.sortOrder,
            isActive: true,
          },
        },
        { upsert: true, new: true }
      );
      upserted += 1;
    }
    return upserted;
  }

  public async listActivePlans(): Promise<PlanDto[]> {
    const docs = await Plan.find({ isActive: true }).sort({ sortOrder: 1 }).lean();
    if (!docs.length) {
      return DEFAULT_PLANS.map((p) => ({
        id: p.planId,
        name: p.name,
        tagline: p.tagline,
        description: p.description,
        priceInrMonthly: p.priceInrMonthly,
        storageLimitBytes: p.storageLimitBytes,
        monthlyExtractionLimit: p.monthlyExtractionLimit,
        dailyApiRequestLimit: p.dailyApiRequestLimit,
        storageDayRateInr: p.storageDayRateInr,
        minRetentionDays: p.minRetentionDays,
        defaultRetentionDays: p.defaultRetentionDays,
        features: p.features,
        contactSales: p.contactSales,
        highlighted: p.highlighted,
        sortOrder: p.sortOrder,
      }));
    }
    return docs.map((d) => docToDto(d));
  }

  public async getPlanById(planId: string): Promise<PlanLimits> {
    const doc = await Plan.findOne({ planId, isActive: true }).lean();
    if (doc) {
      return dtoToLimits(docToDto(doc));
    }
    const fallback = DEFAULT_PLANS.find((p) => p.planId === planId);
    if (fallback) {
      return dtoToLimits({
        id: fallback.planId,
        name: fallback.name,
        tagline: fallback.tagline,
        description: fallback.description,
        priceInrMonthly: fallback.priceInrMonthly,
        storageLimitBytes: fallback.storageLimitBytes,
        monthlyExtractionLimit: fallback.monthlyExtractionLimit,
        dailyApiRequestLimit: fallback.dailyApiRequestLimit,
        storageDayRateInr: fallback.storageDayRateInr,
        minRetentionDays: fallback.minRetentionDays,
        defaultRetentionDays: fallback.defaultRetentionDays,
        features: fallback.features,
        contactSales: fallback.contactSales,
        highlighted: fallback.highlighted,
        sortOrder: fallback.sortOrder,
      });
    }
    if (planId in PLANS) {
      return PLANS[planId as keyof typeof PLANS];
    }
    return FREE_PLAN;
  }
}

export default new PlanService();
