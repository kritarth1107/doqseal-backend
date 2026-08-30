import mongoose, { Schema, Document } from 'mongoose';

export type ExtractionStatus =
  | 'approved'
  | 'approved_with_warnings'
  | 'needs_review';

export interface IExtraction extends Document {
  extractionId: string;
  documentId: string;
  jobId: string;
  organisationId: string;
  projectId: string;
  version: number;
  data: Record<string, unknown>;
  fieldConfidence: Record<string, number>;
  validationErrors: string[];
  status: ExtractionStatus;
  strategy?: string | null;
  approvedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const ExtractionSchema: Schema = new Schema(
  {
    extractionId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    documentId: {
      type: String,
      required: true,
      index: true,
    },
    jobId: {
      type: String,
      required: true,
      index: true,
    },
    organisationId: {
      type: String,
      required: true,
      index: true,
    },
    projectId: {
      type: String,
      required: true,
      index: true,
    },
    version: {
      type: Number,
      default: 1,
    },
    data: {
      type: Schema.Types.Mixed,
      default: {},
    },
    fieldConfidence: {
      type: Schema.Types.Mixed,
      default: {},
    },
    validationErrors: {
      type: [String],
      default: [],
    },
    status: {
      type: String,
      enum: ['approved', 'approved_with_warnings', 'needs_review'],
      default: 'approved',
      index: true,
    },
    strategy: {
      type: String,
      default: null,
    },
    approvedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    collection: 'extractions',
  }
);

ExtractionSchema.index({ documentId: 1, version: -1 });

const Extraction = mongoose.model<IExtraction>('Extraction', ExtractionSchema);

export default Extraction;