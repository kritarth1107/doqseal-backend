import mongoose, { Schema, Document } from 'mongoose';

export type ActionType = 'resolve' | 'override' | 'request';

export type ActionStatus = 'pending_checker' | 'active' | 'lapsed';

export interface IBundleExceptionAction extends Document {
  actionId: string;
  organisationId: string;
  bundleId: string;
  runId: string;
  exceptionKey: string;
  valuesHash: string;
  type: ActionType;
  reason?: string | null;
  /** The value a person picked as correct when resolving a conflict */
  resolvedValue?: string | null;
  actorId: string;
  checkerId?: string | null;
  status: ActionStatus;
  createdAt: Date;
  updatedAt: Date;
}

const BundleExceptionActionSchema: Schema = new Schema(
  {
    actionId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    organisationId: {
      type: String,
      required: true,
      index: true,
    },
    bundleId: {
      type: String,
      required: true,
      index: true,
    },
    runId: {
      type: String,
      required: true,
      index: true,
    },
    exceptionKey: {
      type: String,
      required: true,
    },
    valuesHash: {
      type: String,
      required: true,
    },
    type: {
      type: String,
      enum: ['resolve', 'override', 'request'],
      required: true,
    },
    reason: {
      type: String,
      default: null,
    },
    resolvedValue: {
      type: String,
      default: null,
    },
    actorId: {
      type: String,
      required: true,
    },
    checkerId: {
      type: String,
      default: null,
    },
    status: {
      type: String,
      enum: ['pending_checker', 'active', 'lapsed'],
      default: 'active',
    },
  },
  {
    timestamps: true,
    collection: 'bundle_exception_actions',
  }
);

BundleExceptionActionSchema.index({
  organisationId: 1,
  bundleId: 1,
  exceptionKey: 1,
  valuesHash: 1,
});
BundleExceptionActionSchema.index({ bundleId: 1, status: 1 });

const BundleExceptionAction = mongoose.model<IBundleExceptionAction>(
  'BundleExceptionAction',
  BundleExceptionActionSchema
);

export default BundleExceptionAction;
