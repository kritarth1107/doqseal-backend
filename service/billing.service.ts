import Organisation from '../model/organisation.model';
import StorageDayCharge from '../model/storageDayCharge.model';
import OrganisationSubscription from '../model/organisationSubscription.model';
import BillingInvoice from '../model/billingInvoice.model';
import quotaService from './quota.service';
import planService from './plan.service';
import cashfreeClient from '../utils/cashfree.client';
import {
  getCheckoutMode,
  isCheckoutAvailable,
  resolveBillingProvider,
} from '../utils/billingProvider.util';
import { STORAGE_DAY_RATE_INR, YEARLY_SUBSCRIPTION_DISCOUNT_PERCENT } from '../constants/plans';

export type PaymentMethod = {
  type?: string;
  brand: string;
  last4: string;
  expiryMonth?: number | null;
  expiryYear?: number | null;
  umn?: string | null;
};

export type BillingInvoiceDto = {
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
    const catalogPlans = await planService.listActivePlans();

    const activeSub = await OrganisationSubscription.findOne({
      organisationId,
      status: { $in: ['active', 'bank_approval_pending', 'on_hold'] },
    })
      .sort({ updatedAt: -1 })
      .lean();

    const billing = (org.planDetails as { billing?: Record<string, unknown> } | undefined)
      ?.billing;

    const paymentMethod =
      (activeSub?.paymentMethod as PaymentMethod | null) ||
      (billing?.paymentMethod as PaymentMethod | null) ||
      null;

    const storedMethods = (billing?.paymentMethods as PaymentMethod[] | undefined) || [];
    const paymentMethods =
      storedMethods.length > 0
        ? storedMethods
        : paymentMethod
          ? [paymentMethod]
          : [];

    const dbInvoices = await BillingInvoice.find({ organisationId })
      .sort({ date: -1 })
      .limit(24)
      .lean();

    const storedInvoices: BillingInvoiceDto[] = dbInvoices.map((inv) => ({
      invoiceId: inv.invoiceId,
      date: inv.date,
      totalInr: inv.totalInr,
      status: inv.status,
      description: inv.description,
    }));

    const storageCharges = await StorageDayCharge.find({ organisationId })
      .sort({ date: -1 })
      .limit(90)
      .lean();

    const chargeInvoices: BillingInvoiceDto[] = storageCharges
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

    const currentCatalog = catalogPlans.find((p) => p.id === planLimits.id);

    const renewsAt =
      activeSub?.currentPeriodEnd || activeSub?.nextChargeAt
        ? new Date(
            (activeSub.currentPeriodEnd || activeSub.nextChargeAt) as Date
          )
            .toISOString()
            .slice(0, 10)
        : planLimits.id === 'free'
          ? null
          : this.nextRenewalDate();

    return {
      plan: {
        id: planLimits.id,
        name: planLimits.name,
        priceInrMonthly: planLimits.priceInrMonthly,
        isFree: planLimits.id === 'free',
        storageDayRateInr: STORAGE_DAY_RATE_INR,
        features: currentCatalog?.features ?? [],
        tagline: currentCatalog?.tagline ?? '',
        renewsAt,
        subscriptionStatus: activeSub?.status || null,
        billingInterval: activeSub?.billingInterval || 'monthly',
      },
      usage,
      paymentMethod,
      paymentMethods,
      invoices,
      yearlyDiscountPercent: YEARLY_SUBSCRIPTION_DISCOUNT_PERCENT,
      plans: catalogPlans.map((p) => ({
        id: p.id,
        name: p.name,
        priceInrMonthly: p.priceInrMonthly,
        priceInrYearly: p.priceInrYearly,
        yearlyDiscountPercent: p.yearlyDiscountPercent,
        storageLimitBytes: p.storageLimitBytes,
        monthlyExtractionLimit: p.monthlyExtractionLimit,
        dailyApiRequestLimit: p.dailyApiRequestLimit,
        storageDayRateInr: p.storageDayRateInr,
        contactSales: p.contactSales,
        description: p.description,
        tagline: p.tagline,
        features: p.features,
        highlighted: p.highlighted,
      })),
      checkoutAvailable: isCheckoutAvailable(),
      checkoutMode: getCheckoutMode(),
      checkoutProvider: resolveBillingProvider(),
    };
  }

  public async listPlans() {
    return planService.listActivePlans();
  }

  private nextRenewalDate(): string {
    const d = new Date();
    d.setMonth(d.getMonth() + 1);
    d.setDate(1);
    return d.toISOString().slice(0, 10);
  }
}

export default new BillingService();
