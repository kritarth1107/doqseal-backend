import mongoose, { Schema, Document } from 'mongoose';

export type RequestLinkStatus = 'active' | 'paused' | 'expired';

export interface IRequestRequirement {
  requirementId: string;
  label: string;
  description?: string | null;
  allowedExtensions?: string[];
  required: boolean;
}

export interface IRequestLinkSettings {
  collectName: boolean;
  requireEmail: boolean;
  requireMobile: boolean;
  verifyEmail: boolean;
  verifyMobile: boolean;
}

export interface IRequestLink extends Document {
  requestLinkId: string;
  organisationId: string;
  slug: string;
  publicToken: string;
  title: string;
  description?: string | null;
  requirements: IRequestRequirement[];
  settings: IRequestLinkSettings;
  projectId?: string | null;
  status: RequestLinkStatus;
  expiresAt?: Date | null;
  createdBy: string;
  deletedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const RequirementSchema = new Schema(
  {
    requirementId: { type: String, required: true },
    label: { type: String, required: true, trim: true },
    description: { type: String, default: null },
    allowedExtensions: { type: [String], default: [] },
    required: { type: Boolean, default: true },
  },
  { _id: false }
);

const SettingsSchema = new Schema(
  {
    collectName: { type: Boolean, default: true },
    requireEmail: { type: Boolean, default: true },
    requireMobile: { type: Boolean, default: false },
    verifyEmail: { type: Boolean, default: false },
    verifyMobile: { type: Boolean, default: false },
  },
  { _id: false }
);

const RequestLinkSchema = new Schema(
  {
    requestLinkId: { type: String, required: true, unique: true, index: true },
    organisationId: { type: String, required: true, index: true },
    slug: { type: String, required: true, unique: true, index: true },
    publicToken: { type: String, required: true, unique: true, index: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, default: null },
    requirements: { type: [RequirementSchema], default: [] },
    settings: { type: SettingsSchema, default: () => ({}) },
    projectId: { type: String, default: null, index: true },
    status: {
      type: String,
      enum: ['active', 'paused', 'expired'],
      default: 'active',
      index: true,
    },
    expiresAt: { type: Date, default: null },
    createdBy: { type: String, required: true },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

RequestLinkSchema.index({ organisationId: 1, deletedAt: 1, createdAt: -1 });

export default mongoose.model<IRequestLink>('RequestLink', RequestLinkSchema);
