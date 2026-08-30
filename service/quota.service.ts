import UsageQuota from '../model/usageQuota.model';
import Document from '../model/document.model';
import ExtractionJob from '../model/extractionJob.model';

/** Current starter plan limits (single plan until upgrades ship) */
export const PLAN = {
  id: 'starter',
  name: 'Starter',
  storageLimitBytes: 100 * 1024 * 1024, // 100 MB
  monthlyExtractionLimit: 500,
  dailyApiRequestLimit: 10_000,
} as const;

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
    const mb = Math.round((bytes / (1024 * 1024)) * 100) / 100;
    return { value: mb, unit: 'MB', label: `${mb} MB` };
  }

  public async getStorageUsedBytes(organisationId: string): Promise<number> {
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

  public async assertUploadAllowed(
    organisationId: string,
    incomingBytes = 0
  ): Promise<void> {
    const used = await this.getStorageUsedBytes(organisationId);
    if (used + incomingBytes > PLAN.storageLimitBytes) {
      const limitMb = PLAN.storageLimitBytes / (1024 * 1024);
      throw new Error(
        `Document storage quota exceeded (${limitMb} MB per organisation on the ${PLAN.name} plan)`
      );
    }
  }

  public async assertExtractionAllowed(organisationId: string): Promise<void> {
    const count = await this.getMonthlyExtractionCount(organisationId);
    if (count >= PLAN.monthlyExtractionLimit) {
      throw new Error(
        `Monthly AI extraction quota exceeded (${PLAN.monthlyExtractionLimit} per organisation on the ${PLAN.name} plan)`
      );
    }
  }

  public async assertApiAllowed(organisationId: string): Promise<void> {
    const date = this.todayKey();
    const quota = await UsageQuota.findOne({ organisationId, date }).lean();
    const count = quota?.apiRequestCount ?? 0;
    if (count >= PLAN.dailyApiRequestLimit) {
      throw new Error(
        `Daily API request quota exceeded (${PLAN.dailyApiRequestLimit.toLocaleString()} per day on the ${PLAN.name} plan)`
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
    const [quota, storageUsedBytes, extractionsUsed] = await Promise.all([
      UsageQuota.findOne({ organisationId, date }).lean(),
      this.getStorageUsedBytes(organisationId),
      this.getMonthlyExtractionCount(organisationId),
    ]);

    const apiUsed = quota?.apiRequestCount ?? 0;
    const usedFmt = this.formatBytes(storageUsedBytes);
    const limitFmt = this.formatBytes(PLAN.storageLimitBytes);
    const storageUsedMb =
      Math.round((storageUsedBytes / (1024 * 1024)) * 100) / 100;
    const storageLimitMb = PLAN.storageLimitBytes / (1024 * 1024);

    const quotas = [
      {
        id: 'storage',
        name: 'Document storage',
        used: storageUsedMb,
        limit: storageLimitMb,
        unit: 'MB',
        usedRaw: storageUsedBytes,
        limitRaw: PLAN.storageLimitBytes,
        usedLabel: usedFmt.label,
        limitLabel: limitFmt.label,
        utilisedText: `${usedFmt.label} utilised of ${limitFmt.label}`,
      },
      {
        id: 'extractions',
        name: 'AI extractions / month',
        used: extractionsUsed,
        limit: PLAN.monthlyExtractionLimit,
        unit: '',
        usedLabel: extractionsUsed.toLocaleString(),
        limitLabel: PLAN.monthlyExtractionLimit.toLocaleString(),
        utilisedText: `${extractionsUsed.toLocaleString()} utilised of ${PLAN.monthlyExtractionLimit.toLocaleString()}`,
      },
      {
        id: 'api',
        name: 'API requests / day',
        used: apiUsed,
        limit: PLAN.dailyApiRequestLimit,
        unit: '',
        usedLabel: apiUsed.toLocaleString(),
        limitLabel: PLAN.dailyApiRequestLimit.toLocaleString(),
        utilisedText: `${apiUsed.toLocaleString()} utilised of ${PLAN.dailyApiRequestLimit.toLocaleString()}`,
      },
    ];

    return {
      date,
      plan: {
        id: PLAN.id,
        name: PLAN.name,
        upgradeAvailable: false,
      },
      quotas,
      storage: {
        usedBytes: storageUsedBytes,
        limitBytes: PLAN.storageLimitBytes,
        usedLabel: usedFmt.label,
        limitLabel: limitFmt.label,
        utilisedText: `${usedFmt.label} utilised of ${limitFmt.label}`,
      },
      uploadCount: quota?.uploadCount ?? 0,
      limit: PLAN.dailyApiRequestLimit,
      remaining: Math.max(PLAN.dailyApiRequestLimit - apiUsed, 0),
    };
  }
}

export default new QuotaService();
