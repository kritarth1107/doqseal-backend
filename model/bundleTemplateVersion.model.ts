import mongoose, { Schema, Document } from 'mongoose';
import { IDraft } from './bundleTemplate.model';

export interface ICompiledFrom {
  instructions: string;
  modelDeployment?: string;
  unresolved?: Array<{
    text: string;
    reason: string;
  }>;
}

export interface IBundleTemplateVersion extends Document {
  templateId: string;
  organisationId: string | null;
  version: number;
  snapshot: IDraft;
  compiledFrom?: ICompiledFrom | null;
  publishedBy: string;
  publishedAt: Date;
}

const SnapshotSchema = new Schema(
  {
    instructions: { type: String, default: '' },
    documentTypes: { type: [Schema.Types.Mixed], default: [] },
    profileFields: { type: [Schema.Types.Mixed], default: [] },
    rules: { type: [Schema.Types.Mixed], default: [] },
    outputSchema: { type: [Schema.Types.Mixed], default: [] },
    automation: { type: Schema.Types.Mixed, default: null },
    fieldMapping: { type: Schema.Types.Mixed, default: {} },
  },
  { _id: false }
);

const CompiledFromSchema = new Schema(
  {
    instructions: { type: String, required: true },
    modelDeployment: { type: String, default: null },
    unresolved: {
      type: [
        {
          text: { type: String, required: true },
          reason: { type: String, required: true },
        },
      ],
      default: [],
    },
  },
  { _id: false }
);

const BundleTemplateVersionSchema: Schema = new Schema(
  {
    templateId: {
      type: String,
      required: true,
      index: true,
    },
    organisationId: {
      type: String,
      default: null,
      index: true,
    },
    version: {
      type: Number,
      required: true,
    },
    snapshot: {
      type: SnapshotSchema,
      required: true,
    },
    compiledFrom: {
      type: CompiledFromSchema,
      default: null,
    },
    publishedBy: {
      type: String,
      required: true,
    },
    publishedAt: {
      type: Date,
      required: true,
      default: Date.now,
    },
  },
  {
    timestamps: false,
    collection: 'bundle_template_versions',
  }
);

BundleTemplateVersionSchema.index({ templateId: 1, version: 1 }, { unique: true });
BundleTemplateVersionSchema.index({ organisationId: 1, templateId: 1 });

const BundleTemplateVersion = mongoose.model<IBundleTemplateVersion>(
  'BundleTemplateVersion',
  BundleTemplateVersionSchema
);

export default BundleTemplateVersion;
