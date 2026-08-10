import mongoose, { Schema, Document } from 'mongoose';

export interface IProjectField {
  key: string;
  label: string;
  type: 'string' | 'number' | 'boolean' | 'date';
  required?: boolean;
  validate?: Record<string, unknown>;
}

export interface IProject extends Document {
  projectId: string;
  organisationId: string;
  name: string;
  description?: string;
  extractionHint?: string;
  fields: IProjectField[];
  crossFieldRules: Record<string, unknown>[];
  status: 'active' | 'archived';
  createdBy: string;
  deletedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const ProjectFieldSchema = new Schema(
  {
    key: { type: String, required: true },
    label: { type: String, required: true },
    type: {
      type: String,
      enum: ['string', 'number', 'boolean', 'date'],
      default: 'string',
    },
    required: { type: Boolean, default: false },
    validate: { type: Schema.Types.Mixed, default: {} },
  },
  { _id: false }
);

const ProjectSchema: Schema = new Schema(
  {
    projectId: {
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
    name: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      default: '',
    },
    extractionHint: {
      type: String,
      default: '',
    },
    fields: {
      type: [ProjectFieldSchema],
      default: [],
    },
    crossFieldRules: {
      type: [Schema.Types.Mixed],
      default: [],
    },
    status: {
      type: String,
      enum: ['active', 'archived'],
      default: 'active',
      index: true,
    },
    createdBy: {
      type: String,
      required: true,
    },
    deletedAt: {
      type: Date,
      default: null,
      index: true,
    },
  },
  {
    timestamps: true,
    collection: 'projects',
  }
);

ProjectSchema.index({ organisationId: 1, status: 1, deletedAt: 1 });

const Project = mongoose.model<IProject>('Project', ProjectSchema);

export default Project;