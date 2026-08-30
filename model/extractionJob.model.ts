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