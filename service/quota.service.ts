import UsageQuota from '../model/usageQuota.model';
import Document from '../model/document.model';
import ExtractionJob from '../model/extractionJob.model';
import Organisation from '../model/organisation.model';
import {
  FREE_PLAN,
  listPublicPlans,
  resolvePlanLimits,
  STORAGE_DAY_RATE_INR,
  type PlanLimits,
} from '../constants/plans';

export class QuotaService {
  private todayKey(): string {
    return new Date().toISOString().slice(0, 10);
  }

  private monthStart(): Date {
    const now = new Date();
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  }

  private formatBytes(bytes: number): { value: number; unit: string; label: string } {
    if (bytes < 1024) {
      return { value: bytes, unit: 'B', label: `${bytes} B` };
    }
    if (bytes < 1024 * 1024) {
      const kb = Math.round((bytes / 1024) * 10) / 10;
      return { value: kb, unit: 'KB', label: `${kb} KB` };
    }
    if (bytes < 1024 * 1024 * 1024) {
      const mb = Math.round((bytes / (1024 * 1024)) * 100) / 100;
      return { value: mb, unit: 'MB', label: `${mb} MB` };
    }
    const gb = Math.round((bytes / (1024 * 1024 * 1024)) * 100) / 100;
    return { value: gb, unit: 'GB', label: `${gb} GB` };
  }

  public async getPlanLimits(organisationId: string): Promise<PlanLimits> {
    const org = await Organisation.findOne({
      publicId: organisationId,
      deletedAt: null,
    }).lean();
    if (!org) return FREE_PLAN;
    // Demo workspace (demo@doqseal.com) gets Growth; everyone else is Free.
    if ((org as { isDemo?: boolean }).isDemo) {
      return resolvePlanLimits({ planId: 'growth' });
    }
    return FREE_PLAN;
  }

  public async getStorageUsedBytes(organisationId: string): Promise<number> {
    // Only count bytes still stored in object storage (purged files free quota)
    const result = await Document.aggregate([
      {
        $match: {
          organisationId,
          deletedAt: null,
          $or: [{ filePurgedAt: null }, { filePurgedAt: { $exists: false } }],
        },
      },
      {
        $group: {
          _id: null,
          total: { $sum: '$size' },
        },
      },
    ]);
    return result[0]?.total ?? 0;
  }

  public async getMonthlyExtractionCount(
    organisationId: string
  ): Promise<number> {
    return ExtractionJob.countDocuments({
      organisationId,
      status: { $in: ['completed', 'processing', 'queued'] },
      createdAt: { $gte: this.monthStart() },
    });
  }

  public async countBillableStoredDocuments(
    organisationId: string
  ): Promise<number> {
    return Document.countDocuments({
      organisationId,
      deletedAt: null,
      $or: [{ filePurgedAt: null }, { filePurgedAt: { $exists: false } }],
    });
  }

  public async assertUploadAllowed(
    organisationId: string,
    incomingBytes = 0
  ): Promise<void> {
    const plan = await this.getPlanLimits(organisationId);
    const used = await this.getStorageUsedBytes(organisationId);
    if (used + incomingBytes > plan.storageLimitBytes) {
      throw new Error(
        `Document storage quota exceeded (${this.formatBytes(plan.storageLimitBytes).label} on the ${plan.name} plan). Upgrade to continue.`
      );
    }
  }

  public async assertExtractionAllowed(organisationId: string): Promise<void> {
    const plan = await this.getPlanLimits(organisationId);
    const count = await this.getMonthlyExtractionCount(organisationId);
    if (count >= plan.monthlyExtractionLimit) {
      throw new Error(
        `Monthly AI extraction quota exceeded (${plan.monthlyExtractionLimit} on the ${plan.name} plan). Upgrade to continue.`
      );
    }
  }

  public async assertApiAllowed(organisationId: string): Promise<void> {
    const plan = await this.getPlanLimits(organisationId);
    if (plan.dailyApiRequestLimit === 0) {
      throw new Error(
        `API access is not included on the ${plan.name} plan. Upgrade to enable API requests.`
      );
    }
    if (plan.dailyApiRequestLimit === null) {
      return; // unlimited
    }
    const date = this.todayKey();
    const quota = await UsageQuota.findOne({ organisationId, date }).lean();
    const count = quota?.apiRequestCount ?? 0;
    if (count >= plan.dailyApiRequestLimit) {
      throw new Error(
        `Daily API request quota exceeded (${plan.dailyApiRequestLimit.toLocaleString()} / day on the ${plan.name} plan).`
      );
    }
  }

  public async incrementUploadCount(organisationId: string): Promise<void> {
    const date = this.todayKey();
    await UsageQuota.findOneAndUpdate(
      { organisationId, date },
      { $inc: { uploadCount: 1 } },
      { upsert: true, new: true }
    );
  }

  public async incrementApiRequest(organisationId: string): Promise<void> {
    const date = this.todayKey();
    await UsageQuota.findOneAndUpdate(
      { organisationId, date },
      { $inc: { apiRequestCount: 1 } },
      { upsert: true, new: true }
    );
  }

  public async trackApiRequest(organisationId: string): Promise<void> {
    await this.assertApiAllowed(organisationId);
    await this.incrementApiRequest(organisationId);
  }

  public async getUsage(organisationId: string) {
    const date = this.todayKey();
    const plan = await this.getPlanLimits(organisationId);
    const [quota, storageUsedBytes, extractionsUsed, billableDocs] =
      await Promise.all([
        UsageQuota.findOne({ organisationId, date }).lean(),
        this.getStorageUsedBytes(organisationId),
        this.getMonthlyExtractionCount(organisationId),
        this.countBillableStoredDocuments(organisationId),
      ]);

    const apiUsed = quota?.apiRequestCount ?? 0;
    const apiLimit = plan.dailyApiRequestLimit;
    const usedFmt = this.formatBytes(storageUsedBytes);
    const limitFmt = this.formatBytes(plan.storageLimitBytes);
    const storageUsedMb =
      Math.round((storageUsedBytes / (1024 * 1024)) * 100) / 100;
    const storageLimitMb =
      Math.round((plan.storageLimitBytes / (1024 * 1024)) * 100) / 100;

    const quotas = [
      {
        id: 'storage',
        name: 'Document storage',
        used: storageUsedMb,
        limit: storageLimitMb,
        unit: 'MB',
        usedRaw: storageUsedBytes,
        limitRaw: plan.storageLimitBytes,
        usedLabel: usedFmt.label,
        limitLabel: limitFmt.label,
        utilisedText: `${usedFmt.label} utilised of ${limitFmt.label}`,
      },
      {
        id: 'extractions',
        name: 'AI extractions / month',
        used: extractionsUsed,
        limit: plan.monthlyExtractionLimit,
        unit: '',
        usedLabel: extractionsUsed.toLocaleString(),
        limitLabel: plan.monthlyExtractionLimit.toLocaleString(),
        utilisedText: `${extractionsUsed.toLocaleString()} utilised of ${plan.monthlyExtractionLimit.toLocaleString()}`,
      },
      {
        id: 'api',
        name: 'API requests / day',
        used: apiUsed,
        limit: apiLimit,
        unit: '',
        usedLabel: apiUsed.toLocaleString(),
        limitLabel:
          apiLimit === null ? 'Unlimited' : apiLimit.toLocaleString(),
        utilisedText:
          apiLimit === null
            ? `${apiUsed.toLocaleString()} utilised (unlimited)`
            : `${apiUsed.toLocaleString()} utilised of ${apiLimit.toLocaleString()}`,
      },
    ];

    const estimatedStorageDayChargeInr =
      Math.round(billableDocs * STORAGE_DAY_RATE_INR * 100) / 100;

    return {
      date,
      plan: {
        id: plan.id,
        name: plan.name,
        priceInrMonthly: plan.priceInrMonthly,
        upgradeAvailable: plan.id === 'free' || plan.id === 'starter' || plan.id === 'growth',
        isFree: plan.id === 'free',
        storageDayRateInr: STORAGE_DAY_RATE_INR,
        contactSales: Boolean(plan.contactSales),
      },
      plans: listPublicPlans(),
      quotas,
      storage: {
        usedBytes: storageUsedBytes,
        limitBytes: plan.storageLimitBytes,
        usedLabel: usedFmt.label,
        limitLabel: limitFmt.label,
        utilisedText: `${usedFmt.label} utilised of ${limitFmt.label}`,
        billableDocuments: billableDocs,
        estimatedDailyChargeInr: estimatedStorageDayChargeInr,
      },
      uploadCount: quota?.uploadCount ?? 0,
      limit: apiLimit ?? Number.MAX_SAFE_INTEGER,
      remaining:
        apiLimit === null
          ? Number.MAX_SAFE_INTEGER
          : Math.max(apiLimit - apiUsed, 0),
    };
  }
}

export default new QuotaService();

/** @deprecated Use quotaService.getPlanLimits — kept for older imports */
export const PLAN = FREE_PLAN;
