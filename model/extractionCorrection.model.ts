import mongoose, { Schema, Document } from 'mongoose';

/**
 * User corrections to AI-extracted fields.
 * Stored for future GPT-4o fine-tuning / prompt tuning.
 */
export interface IExtractionCorrection extends Document {
  correctionId: string;
  organisationId: string;
  projectId?: string | null;
  documentId: string;
  extractionId: string;
  fieldKey: string;
  previousValue: unknown;
  correctedValue: unknown;
  previousConfidence?: number | null;
  correctedBy: string;
  note?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const ExtractionCorrectionSchema: Schema = new Schema(
  {
    correctionId: {
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
    projectId: {
      type: String,
      default: null,
      index: true,
    },
    documentId: {
      type: String,
      required: true,
      index: true,
    },
    extractionId: {
      type: String,
      required: true,
      index: true,
    },
    fieldKey: {
      type: String,
      required: true,
      index: true,
    },
    previousValue: {
      type: Schema.Types.Mixed,
      default: null,
    },
    correctedValue: {
      type: Schema.Types.Mixed,
      default: null,
    },
    previousConfidence: {
      type: Number,
      default: null,
    },
    correctedBy: {
      type: String,
      required: true,
      index: true,
    },
    note: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true,
    collection: 'extraction_corrections',
  }
);

ExtractionCorrectionSchema.index({ organisationId: 1, createdAt: -1 });
ExtractionCorrectionSchema.index({ documentId: 1, fieldKey: 1 });

const ExtractionCorrection = mongoose.model<IExtractionCorrection>(
  'ExtractionCorrection',
  ExtractionCorrectionSchema
);

export default ExtractionCorrection;
