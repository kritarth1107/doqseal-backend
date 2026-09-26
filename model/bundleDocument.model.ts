import mongoose, { Schema, Document } from 'mongoose';

export type AssignedBy = 'auto' | 'user';

export type ClassificationStatus =
  | 'pending'
  | 'queued'
  | 'classifying'
  | 'classified'
  | 'needs_review'
  | 'failed';

export interface IClassificationState {
  status: ClassificationStatus;
  taskId?: string | null;
  attempts: number;
  lastQueuedAt?: Date | null;
  classifiedAt?: Date | null;
  suggestedTypeKey?: string | null;
  confidence?: number | null;
  reasons: string[];
  alternatives: Array<{ slot: string; confidence: number }>;
  model?: string | null;
  lastError?: string | null;
}

export interface IPageRange {
  start: number;
  end: number;
}

export interface IBundleDocument extends Document {
  bundleId: string;
  organisationId: string;
  documentId: string;
  assignedTypeKey?: string | null;
  classificationConfidence?: number | null;
  assignedBy: AssignedBy;
  pageRange?: IPageRange | null;
  addedBy: string;
  addedAt: Date;
  removedAt?: Date | null;
  /** Set by the bundle processing pipeline; absent on links it never saw */
  classification?: IClassificationState | null;
  /** Identity fields returned by classification, used for consistency checks */
  keyFields?: Record<string, string> | null;
}

const ClassificationStateSchema = new Schema(
  {
    status: {
      type: String,
      enum: ['pending', 'queued', 'classifying', 'classified', 'needs_review', 'failed'],
      required: true,
    },
    taskId: { type: String, default: null },
    attempts: { type: Number, default: 0 },
    lastQueuedAt: { type: Date, default: null },
    classifiedAt: { type: Date, default: null },
    suggestedTypeKey: { type: String, default: null },
    confidence: { type: Number, default: null },
    reasons: { type: [String], default: [] },
    alternatives: { type: [Schema.Types.Mixed], default: [] },
    model: { type: String, default: null },
    lastError: { type: String, default: null },
  },
  { _id: false }
);

const PageRangeSchema = new Schema(
  {
    start: { type: Number, required: true },
    end: { type: Number, required: true },
  },
  { _id: false }
);

const BundleDocumentSchema: Schema = new Schema(
  {
    bundleId: {
      type: String,
      required: true,
      index: true,
    },
    organisationId: {
      type: String,
      required: true,
      index: true,
    },
    documentId: {
      type: String,
      required: true,
      index: true,
    },
    assignedTypeKey: {
      type: String,
      default: null,
    },
    classificationConfidence: {
      type: Number,
      default: null,
    },
    assignedBy: {
      type: String,
      enum: ['auto', 'user'],
      default: 'user',
    },
    pageRange: {
      type: PageRangeSchema,
      default: null,
    },
    addedBy: {
      type: String,
      required: true,
    },
    addedAt: {
      type: Date,
      required: true,
      default: Date.now,
    },
    removedAt: {
      type: Date,
      default: null,
      index: true,
    },
    classification: {
      type: ClassificationStateSchema,
      default: undefined,
    },
    keyFields: {
      type: Schema.Types.Mixed,
      default: undefined,
    },
  },
  {
    timestamps: false,
    collection: 'bundle_documents',
  }
);

BundleDocumentSchema.index({ bundleId: 1, documentId: 1 }, { unique: true });
BundleDocumentSchema.index({ organisationId: 1, bundleId: 1, removedAt: 1 });
BundleDocumentSchema.index({ documentId: 1, removedAt: 1 });

const BundleDocument = mongoose.model<IBundleDocument>(
  'BundleDocument',
  BundleDocumentSchema
);

export default BundleDocument;
