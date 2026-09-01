import mongoose, { Schema, Document } from 'mongoose';

export interface IApiKey extends Document {
  organisationId: string;
  name: string;
  appId: string;
  secretHint: string;
  status: 'ACTIVE' | 'REVOKED' | 'EXPIRED';
  createdBy: string;
  expiresAt?: Date | null;
  lastUsedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const ApiKeySchema: Schema = new Schema(
  {
    organisationId: {
      type: String,
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    appId: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
      index: true,
    },
    secretHint: {
      type: String,
      required: true,
      minlength: 6,
      maxlength: 6,
    },
    status: {
      type: String,
      enum: ['ACTIVE', 'REVOKED', 'EXPIRED'],
      default: 'ACTIVE',
    },
    createdBy: {
      type: String,
      required: true,
    },
    expiresAt: {
      type: Date,
      default: null,
    },
    lastUsedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    collection: 'api_keys',
  }
);

ApiKeySchema.index({ organisationId: 1, status: 1 });

const ApiKey = mongoose.model<IApiKey>('ApiKey', ApiKeySchema);

export default ApiKey;
