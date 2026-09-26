import mongoose, { Schema, Document } from 'mongoose';

export type AssignedBy = 'auto' | 'user';

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
}

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
