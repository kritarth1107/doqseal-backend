import Organisation from '../model/organisation.model';
import Document from '../model/document.model';
import StorageDayCharge from '../model/storageDayCharge.model';
import { STORAGE_DAY_RATE_INR } from '../constants/plans';
import retentionService from './retention.service';

export class BillingMeterService {
  private todayKey(): string {
    return new Date().toISOString().slice(0, 10);
  }

  /** Accrue ₹0.12/doc/day for orgs with stored originals. Idempotent per day. */
  public async accrueStorageDayCharges(date = this.todayKey()) {
    const orgs = await Organisation.find({
      deletedAt: null,
      isActive: true,
    })
      .select('publicId')
      .lean();

    let organisationsBilled = 0;
    let totalAmountInr = 0;

    for (const org of orgs) {
      const organisationId = org.publicId as string;
      if (!organisationId) continue;

      const documentCount = await Document.countDocuments({
        organisationId,
        deletedAt: null,
        $or: [{ filePurgedAt: null }, { filePurgedAt: { $exists: false } }],
        storagePath: { $nin: [null, ''] },
      });

      if (documentCount === 0) continue;

      const amountInr =
        Math.round(documentCount * STORAGE_DAY_RATE_INR * 100) / 100;

      await StorageDayCharge.findOneAndUpdate(
        { organisationId, date },
        {
          $set: {
            documentCount,
            rateInr: STORAGE_DAY_RATE_INR,
            amountInr,
          },
        },
        { upsert: true, new: true }
      );

      organisationsBilled += 1;
      totalAmountInr += amountInr;
    }

    return {
      date,
      organisationsBilled,
      totalAmountInr: Math.round(totalAmountInr * 100) / 100,
      rateInr: STORAGE_DAY_RATE_INR,
    };
  }

  /** Run TTL file purge + daily storage accrual (called on an interval). */
  public async runDailyJobs() {
    const purge = await retentionService.purgeExpiredFiles();
    const charges = await this.accrueStorageDayCharges();
    return { purge, charges };
  }
}

export default new BillingMeterService();
