import mongoose, { Schema, Document } from 'mongoose';

/**
 * Daily storage charges: ₹0.12 × documents with original file still stored.
 */
export interface IStorageDayCharge extends Document {
  organisationId: string;
  date: string; // YYYY-MM-DD UTC
  documentCount: number;
  rateInr: number;
  amountInr: number;
  createdAt: Date;
  updatedAt: Date;
}

const StorageDayChargeSchema: Schema = new Schema(
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
    documentCount: {
      type: Number,
      required: true,
      default: 0,
    },
    rateInr: {
      type: Number,
      required: true,
    },
    amountInr: {
      type: Number,
      required: true,
      default: 0,
    },
  },
  {
    timestamps: true,
    collection: 'storage_day_charges',
  }
);

StorageDayChargeSchema.index({ organisationId: 1, date: 1 }, { unique: true });

const StorageDayCharge = mongoose.model<IStorageDayCharge>(
  'StorageDayCharge',
  StorageDayChargeSchema
);

export default StorageDayCharge;
