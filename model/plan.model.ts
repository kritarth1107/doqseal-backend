import mongoose, { Schema, Document } from 'mongoose';

export interface IPlan extends Document {
  planId: string;
  name: string;
  tagline?: string;
  description?: string;
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
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const PlanSchema: Schema = new Schema(
  {
    planId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    tagline: {
      type: String,
      default: '',
    },
    description: {
      type: String,
      default: '',
    },
    priceInrMonthly: {
      type: Number,
      default: null,
    },
    storageLimitBytes: {
      type: Number,
      default: null,
    },
    monthlyExtractionLimit: {
      type: Number,
      default: null,
    },
    dailyApiRequestLimit: {
      type: Number,
      default: null,
    },
    storageDayRateInr: {
      type: Number,
      default: 0.12,
    },
    minRetentionDays: {
      type: Number,
      default: 15,
    },
    defaultRetentionDays: {
      type: Number,
      default: 15,
    },
    features: {
      type: [String],
      default: [],
    },
    contactSales: {
      type: Boolean,
      default: false,
    },
    highlighted: {
      type: Boolean,
      default: false,
    },
    sortOrder: {
      type: Number,
      default: 0,
      index: true,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
  },
  {
    timestamps: true,
    collection: 'plans',
  }
);

PlanSchema.index({ isActive: 1, sortOrder: 1 });

const Plan = mongoose.model<IPlan>('Plan', PlanSchema);

export default Plan;
