import mongoose, { Schema, Document } from 'mongoose';

export type ExtractionJobStatus =
  | 'queued'
  | 'processing'
  | 'completed'
  | 'failed';

export interface IExtractionJob extends Document {
  jobId: string;
  documentId: string;
  organisationId: string;
  projectId?: string | null;
  status: ExtractionJobStatus;
  error?: string | null;
  startedAt?: Date | null;
  completedAt?: Date | null;
  /** When true, worker/AI is skipped; extraction is canned after demoRevealAt */
  demoMode?: boolean;
  demoRevealAt?: Date | null;
  /** Optional extra context supplied when re-running extraction */
  userContext?: string | null;
  /** Prefer AI vision/LLM over OCR-only fast paths */
  forceAi?: boolean;
  /** Bundle ID when extraction is triggered from a bundle */
  bundleId?: string | null;
  /** Document type key from bundle template */
  typeKey?: string | null;
  /** Schema fields to extract (from bundle template documentType) */
  extractionSchema?: Record<string, unknown> | null;
  /** Schema version for cache invalidation */
  schemaVersion?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const ExtractionJobSchema: Schema = new Schema(
  {
    jobId: {
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
    organisationId: {
      type: String,
      required: true,
      index: true,
    },
    projectId: {
      type: String,
      default: null,
      index: true,
    },
    status: {
      type: String,
      enum: ['queued', 'processing', 'completed', 'failed'],
      default: 'queued',
      index: true,
    },
    error: {
      type: String,
      default: null,
    },
    startedAt: {
      type: Date,
      default: null,
    },
    completedAt: {
      type: Date,
      default: null,
    },
    demoMode: {
      type: Boolean,
      default: false,
      index: true,
    },
    demoRevealAt: {
      type: Date,
      default: null,
    },
    userContext: {
      type: String,
      default: null,
    },
    forceAi: {
      type: Boolean,
      default: false,
    },
    bundleId: {
      type: String,
      default: null,
      index: true,
    },
    typeKey: {
      type: String,
      default: null,
    },
    extractionSchema: {
      type: Schema.Types.Mixed,
      default: null,
    },
    schemaVersion: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true,
    collection: 'extraction_jobs',
  }
);

ExtractionJobSchema.index({ organisationId: 1, status: 1 });
ExtractionJobSchema.index({ documentId: 1, createdAt: -1 });

const ExtractionJob = mongoose.model<IExtractionJob>(
  'ExtractionJob',
  ExtractionJobSchema
);

export default ExtractionJob;