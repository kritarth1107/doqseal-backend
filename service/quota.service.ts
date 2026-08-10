import UsageQuota from '../model/usageQuota.model';

export const DAILY_UPLOAD_LIMIT = Number(process.env.DAILY_UPLOAD_LIMIT || 1000);

export class QuotaService {
  private todayKey(): string {
    return new Date().toISOString().slice(0, 10);
  }

  public async assertUploadAllowed(organisationId: string): Promise<void> {
    const date = this.todayKey();
    const quota = await UsageQuota.findOne({ organisationId, date }).lean();
    const count = quota?.uploadCount ?? 0;

    if (count >= DAILY_UPLOAD_LIMIT) {
      throw new Error(
        `Daily upload quota exceeded (${DAILY_UPLOAD_LIMIT} documents per organisation per day)`
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

  public async getUsage(organisationId: string) {
    const date = this.todayKey();
    const quota = await UsageQuota.findOne({ organisationId, date }).lean();

    return {
      date,
      uploadCount: quota?.uploadCount ?? 0,
      limit: DAILY_UPLOAD_LIMIT,
      remaining: Math.max(DAILY_UPLOAD_LIMIT - (quota?.uploadCount ?? 0), 0),
    };
  }
}

export default new QuotaService();