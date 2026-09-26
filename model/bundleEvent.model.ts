import mongoose, { Schema, Document } from 'mongoose';

export type BundleEventType =
  | 'bundle.document_queued'
  | 'bundle.document_classified'
  | 'bundle.document_classification_failed'
  | 'bundle.status_changed'
  | 'bundle.conflicts_detected';

/**
 * Timeline of bundle pipeline events. `dedupeKey` is unique so retried or
 * duplicated work never records the same event twice.
 */
export interface IBundleEvent extends Document {
  eventId: string;
  organisationId: string;
  bundleId: string;
  type: BundleEventType;
  dedupeKey: string;
  documentId?: string | null;
  from?: string | null;
  to?: string | null;
  data: Record<string, unknown>;
  createdAt: Date;
}

const BundleEventSchema: Schema = new Schema(
  {
    eventId: { type: String, required: true, unique: true },
    organisationId: { type: String, required: true },
    bundleId: { type: String, required: true },
    type: { type: String, required: true },
    dedupeKey: { type: String, required: true, unique: true },
    documentId: { type: String, default: null },
    from: { type: String, default: null },
    to: { type: String, default: null },
    data: { type: Schema.Types.Mixed, default: {} },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    collection: 'bundle_events',
  }
);

BundleEventSchema.index({ organisationId: 1, bundleId: 1, createdAt: -1 });

const BundleEvent = mongoose.model<IBundleEvent>('BundleEvent', BundleEventSchema);

export default BundleEvent;
