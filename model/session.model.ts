import mongoose, { Schema, Document } from 'mongoose';

export interface ISession extends Document {
  userId: string;
  token: string;
  fingerprint: string;
  status: 'ACTIVE' | 'EXPIRED' | 'REVOKED';
  ipAddress?: string;
  userAgent?: string;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const SessionSchema: Schema = new Schema(
  {
    userId: { type: String, required: true, index: true },
    token: { type: String, required: true, unique: true },
    fingerprint: { type: String, required: true, index: true },
    status: {
      type: String,
      enum: ['ACTIVE', 'EXPIRED', 'REVOKED'],
      default: 'ACTIVE',
      index: true,
    },
    ipAddress: { type: String },
    userAgent: { type: String },
    expiresAt: { type: Date, required: true, index: true },
  },
  { timestamps: true, collection: 'sessions' }
);

SessionSchema.index({ userId: 1, status: 1 });

export default mongoose.model<ISession>('Session', SessionSchema);
