import mongoose, { Schema, Document } from 'mongoose';

export interface IUsageQuota extends Document {
  organisationId: string;
  date: string;
  uploadCount: number;
  apiRequestCount: number;
  createdAt: Date;
  updatedAt: Date;
}

const UsageQuotaSchema: Schema = new Schema(
  {
    organisationId: {
      type: String,
      required: true,
      index: true,
    },
    date: {
      type: String,
      required: true,
      index: true,
    },
    uploadCount: {
      type: Number,
      default: 0,
    },
    apiRequestCount: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
    collection: 'usage_quotas',
  }
);

UsageQuotaSchema.index({ organisationId: 1, date: 1 }, { unique: true });

const UsageQuota = mongoose.model<IUsageQuota>('UsageQuota', UsageQuotaSchema);

export default UsageQuota;