import Organisation from '../model/organisation.model';
import StorageDayCharge from '../model/storageDayCharge.model';
import quotaService from './quota.service';
import { listPublicPlans, PLANS, STORAGE_DAY_RATE_INR } from '../constants/plans';

export type PaymentMethod = {
  brand: string;
  last4: string;
  expiryMonth?: number;
  expiryYear?: number;
};

export type BillingInvoice = {
  invoiceId: string;
  date: string;
  totalInr: number;
  status: 'paid' | 'pending' | 'failed';
  description: string;
};

export class BillingService {
  public async getBillingSummary(organisationId: string) {
    const org = await Organisation.findOne({
      publicId: organisationId,
      deletedAt: null,
    }).lean();

    if (!org) {
      throw new Error('Organisation not found');
    }

    const planLimits = await quotaService.getPlanLimits(organisationId);
    const usage = await quotaService.getUsage(organisationId);

    const billing = (org.planDetails as { billing?: Record<string, unknown> } | undefined)
      ?.billing;

    const paymentMethod = (billing?.paymentMethod as PaymentMethod | null) ?? null;

    const storedInvoices = Array.isArray(billing?.invoices)
      ? (billing!.invoices as BillingInvoice[])
      : [];

    const storageCharges = await StorageDayCharge.find({ organisationId })
      .sort({ date: -1 })
      .limit(90)
      .lean();

    const chargeInvoices: BillingInvoice[] = storageCharges
      .filter((row) => row.amountInr > 0)
      .map((row) => ({
        invoiceId: `stor-${row.date}`,
        date: row.date,
        totalInr: row.amountInr,
        status: 'paid' as const,
        description: `Storage (${row.documentCount} docs × ₹${row.rateInr}/day)`,
      }));

    const invoices = [...storedInvoices, ...chargeInvoices]
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 24);

    const storageBalanceInr =
      Math.round((usage.storage?.estimatedDailyChargeInr ?? 0) * 100) / 100;

    const planFeatures = this.planFeatures(planLimits.id);

    return {
      plan: {
        id: planLimits.id,
        name: planLimits.name,
        priceInrMonthly: planLimits.priceInrMonthly,
        isFree: planLimits.id === 'free',
        storageDayRateInr: STORAGE_DAY_RATE_INR,
        features: planFeatures,
        renewsAt: planLimits.id === 'free' ? null : this.nextRenewalDate(),
      },
      usage,
      paymentMethod,
      storageCredits: {
        balanceInr: storageBalanceInr,
        billableDocuments: usage.storage?.billableDocuments ?? 0,
        rateInr: STORAGE_DAY_RATE_INR,
        description:
          'Charged per document per day while the original file is stored. Context is kept after TTL purge.',
      },
      invoices,
      plans: listPublicPlans().map((p) => ({
        ...p,
        features: this.planFeatures(p.id),
        tagline: this.planTagline(p.id),
      })),
      checkoutAvailable: false,
    };
  }

  private planTagline(planId: string): string {
    const map: Record<string, string> = {
      free: 'Try DoqSeal with limited storage and extractions',
      starter: 'Small teams getting started with document AI',
      growth: 'Growing teams with higher limits and API access',
      scale: 'High-volume extraction and unlimited API',
      custom: 'Enterprise pricing tailored to your workflow',
    };
    return map[planId] || '';
  }

  private planFeatures(planId: string): string[] {
    const p =
      planId in PLANS
        ? PLANS[planId as keyof typeof PLANS]
        : planId === 'custom'
          ? null
          : PLANS.free;

    if (planId === 'custom') {
      return [
        'Custom extraction pricing',
        'Flexible storage & API limits',
        'Dedicated support',
        `₹${STORAGE_DAY_RATE_INR}/doc/day storage metering`,
      ];
    }

    if (!p) return [];

    const storage =
      p.storageLimitBytes >= 1024 * 1024 * 1024
        ? `${Math.round(p.storageLimitBytes / (1024 * 1024 * 1024))} GB storage`
        : `${Math.round(p.storageLimitBytes / (1024 * 1024))} MB storage`;

    const api =
      p.dailyApiRequestLimit === null
        ? 'Unlimited API requests / day'
        : p.dailyApiRequestLimit === 0
          ? 'No API access'
          : `${p.dailyApiRequestLimit.toLocaleString()} API requests / day`;

    const base = [
      storage,
      `${p.monthlyExtractionLimit.toLocaleString()} AI extractions / month`,
      api,
      `₹${STORAGE_DAY_RATE_INR}/doc/day while file stored`,
    ];

    if (planId === 'free') return base;

    return [`Everything in Free, plus higher limits`, ...base.slice(1)];
  }

  private nextRenewalDate(): string {
    const d = new Date();
    d.setMonth(d.getMonth() + 1);
    d.setDate(1);
    return d.toISOString().slice(0, 10);
  }
}

export default new BillingService();
