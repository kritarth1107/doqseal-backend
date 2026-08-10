import mongoose, { Schema, Document } from 'mongoose';

/**
 * API Key Interface for TypeScript
 */
export interface IApiKey extends Document {
  organisationId: string;
  name: string;
  key: string;       // The full secret key (stored as is or hashed, here stored for simplicity but indexed)
  keyHint: string;   // Visible part of the key (e.g., "sak_live_...abcd")
  status: 'ACTIVE' | 'REVOKED' | 'EXPIRED';
  createdBy: string; // The userId who generated it
  expiresAt?: Date | null;
  lastUsedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * API Key Schema - Organisation-based authentication tokens
 */
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
    key: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    keyHint: {
      type: String,
      required: true,
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
      default: null, // null means "Never Expire"
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

// Index for fast lookups by org
ApiKeySchema.index({ organisationId: 1, status: 1 });

const ApiKey = mongoose.model<IApiKey>('ApiKey', ApiKeySchema);

export default ApiKey;
