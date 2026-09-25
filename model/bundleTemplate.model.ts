import mongoose, { Schema, Document } from 'mongoose';

/**
 * Document type configuration within a template
 */
export interface IDocumentType {
  key: string;
  label: string;
  required: boolean | string;
  minCount: number;
  maxCount: number;
  acceptedFormats?: string[];
  maxAgeDays?: number | null;
  schemaRef?: string | null;
  inlineFields?: Array<{
    key: string;
    label: string;
    type: 'string' | 'number' | 'boolean' | 'date' | 'array';
    required?: boolean;
  }>;
  classificationHints?: string[];
}

/**
 * Profile field for conditional rules
 */
export interface IProfileField {
  key: string;
  label: string;
  type: 'string' | 'number' | 'boolean' | 'select';
  options?: string[];
  required?: boolean;
  default?: string | number | boolean;
}

/**
 * Rule definition
 */
export interface IRule {
  id: string;
  name: string;
  description?: string;
  category:
    | 'completeness'
    | 'cross_match'
    | 'validity'
    | 'quality'
    | 'extraction'
    | 'custom_ai';
  appliesWhen?: Record<string, unknown>;
  field?: string;
  documents?: string[];
  method?:
    | 'exact'
    | 'similarity'
    | 'numeric_tolerance'
    | 'date_window'
    | 'presence'
    | 'component_match'
    | 'regex'
    | 'sum_equals'
    | 'count_between'
    | 'set_overlap';
  params?: {
    threshold?: number;
    tolerancePct?: number;
    windowDays?: number;
    components?: string[];
    pattern?: string;
    min?: number;
    max?: number;
    minOverlap?: number;
  };
  maxAgeDays?: number;
  requiredPeriodMonths?: number;
  minConfidence?: number;
  requiredPages?: number;
  question?: string;
  expectedAnswer?: string;
  severity: 'blocking' | 'review' | 'info';
  enabled: boolean;
  origin?: 'manual' | 'compiled_from_instructions';
  sourceSpan?: { start: number; end: number };
}

/**
 * Output schema field
 */
export interface IOutputSchemaField {
  key: string;
  label: string;
  type: 'string' | 'number' | 'boolean' | 'date' | 'array' | 'object';
  sources: Array<{
    documentTypeKey: string;
    fieldPath: string;
    priority: number;
  }>;
}

/**
 * Automation configuration
 */
export interface IAutomation {
  trigger: 'manual' | 'on_complete' | 'on_document_change' | 'on_request_link_submitted';
  debounceSeconds?: number;
  actions?: Array<{
    outcome: 'ready' | 'exceptions_found' | 'needs_review' | 'failed';
    action: 'webhook' | 'assign' | 'request_missing' | 'mark_readonly';
    config?: Record<string, unknown>;
  }>;
}

/**
 * Draft template content
 */
export interface IDraft {
  instructions?: string;
  documentTypes: IDocumentType[];
  profileFields: IProfileField[];
  rules: IRule[];
  outputSchema: IOutputSchemaField[];
  automation?: IAutomation;
  fieldMapping?: Record<string, string>;
}

export type BundleTemplateStatus = 'draft' | 'published' | 'archived';

export interface IBundleTemplate extends Document {
  templateId: string;
  organisationId: string | null;
  projectId?: string | null;
  name: string;
  description?: string;
  status: BundleTemplateStatus;
  latestVersion: number;
  draft: IDraft;
  isExample: boolean;
  clonedFrom?: string | null;
  createdBy: string;
  deletedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const DocumentTypeSchema = new Schema(
  {
    key: { type: String, required: true },
    label: { type: String, required: true },
    required: { type: Schema.Types.Mixed, default: true },
    minCount: { type: Number, default: 1 },
    maxCount: { type: Number, default: 1 },
    acceptedFormats: { type: [String], default: [] },
    maxAgeDays: { type: Number, default: null },
    schemaRef: { type: String, default: null },
    inlineFields: {
      type: [
        {
          key: { type: String, required: true },
          label: { type: String, required: true },
          type: {
            type: String,
            enum: ['string', 'number', 'boolean', 'date', 'array'],
            default: 'string',
          },
          required: { type: Boolean, default: false },
        },
      ],
      default: [],
    },
    classificationHints: { type: [String], default: [] },
  },
  { _id: false }
);

const ProfileFieldSchema = new Schema(
  {
    key: { type: String, required: true },
    label: { type: String, required: true },
    type: {
      type: String,
      enum: ['string', 'number', 'boolean', 'select'],
      default: 'string',
    },
    options: { type: [String], default: [] },
    required: { type: Boolean, default: false },
    default: { type: Schema.Types.Mixed, default: null },
  },
  { _id: false }
);

const RuleSchema = new Schema(
  {
    id: { type: String, required: true },
    name: { type: String, required: true },
    description: { type: String, default: '' },
    category: {
      type: String,
      enum: ['completeness', 'cross_match', 'validity', 'quality', 'extraction', 'custom_ai'],
      required: true,
    },
    appliesWhen: { type: Schema.Types.Mixed, default: null },
    field: { type: String, default: null },
    documents: { type: [String], default: [] },
    method: {
      type: String,
      enum: [
        'exact',
        'similarity',
        'numeric_tolerance',
        'date_window',
        'presence',
        'component_match',
        'regex',
        'sum_equals',
        'count_between',
        'set_overlap',
      ],
      default: null,
    },
    params: { type: Schema.Types.Mixed, default: {} },
    maxAgeDays: { type: Number, default: null },
    requiredPeriodMonths: { type: Number, default: null },
    minConfidence: { type: Number, default: null },
    requiredPages: { type: Number, default: null },
    question: { type: String, default: null },
    expectedAnswer: { type: String, default: null },
    severity: {
      type: String,
      enum: ['blocking', 'review', 'info'],
      default: 'review',
    },
    enabled: { type: Boolean, default: true },
    origin: {
      type: String,
      enum: ['manual', 'compiled_from_instructions'],
      default: 'manual',
    },
    sourceSpan: {
      type: { start: Number, end: Number },
      default: null,
    },
  },
  { _id: false }
);

const OutputSchemaFieldSchema = new Schema(
  {
    key: { type: String, required: true },
    label: { type: String, required: true },
    type: {
      type: String,
      enum: ['string', 'number', 'boolean', 'date', 'array', 'object'],
      default: 'string',
    },
    sources: {
      type: [
        {
          documentTypeKey: { type: String, required: true },
          fieldPath: { type: String, required: true },
          priority: { type: Number, default: 0 },
        },
      ],
      default: [],
    },
  },
  { _id: false }
);

const AutomationSchema = new Schema(
  {
    trigger: {
      type: String,
      enum: ['manual', 'on_complete', 'on_document_change', 'on_request_link_submitted'],
      default: 'manual',
    },
    debounceSeconds: { type: Number, default: 60 },
    actions: {
      type: [
        {
          outcome: {
            type: String,
            enum: ['ready', 'exceptions_found', 'needs_review', 'failed'],
            required: true,
          },
          action: {
            type: String,
            enum: ['webhook', 'assign', 'request_missing', 'mark_readonly'],
            required: true,
          },
          config: { type: Schema.Types.Mixed, default: {} },
        },
      ],
      default: [],
    },
  },
  { _id: false }
);

const DraftSchema = new Schema(
  {
    instructions: { type: String, default: '' },
    documentTypes: { type: [DocumentTypeSchema], default: [] },
    profileFields: { type: [ProfileFieldSchema], default: [] },
    rules: { type: [RuleSchema], default: [] },
    outputSchema: { type: [OutputSchemaFieldSchema], default: [] },
    automation: { type: AutomationSchema, default: null },
    fieldMapping: { type: Schema.Types.Mixed, default: {} },
  },
  { _id: false }
);

const BundleTemplateSchema: Schema = new Schema(
  {
    templateId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    organisationId: {
      type: String,
      default: null,
      index: true,
    },
    projectId: {
      type: String,
      default: null,
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
    status: {
      type: String,
      enum: ['draft', 'published', 'archived'],
      default: 'draft',
      index: true,
    },
    latestVersion: {
      type: Number,
      default: 0,
    },
    draft: {
      type: DraftSchema,
      default: () => ({
        instructions: '',
        documentTypes: [],
        profileFields: [],
        rules: [],
        outputSchema: [],
        automation: null,
        fieldMapping: {},
      }),
    },
    isExample: {
      type: Boolean,
      default: false,
      index: true,
    },
    clonedFrom: {
      type: String,
      default: null,
    },
    createdBy: {
      type: String,
      required: true,
      index: true,
    },
    deletedAt: {
      type: Date,
      default: null,
      index: true,
    },
  },
  {
    timestamps: true,
    collection: 'bundle_templates',
  }
);

BundleTemplateSchema.index({ organisationId: 1, status: 1, deletedAt: 1 });
BundleTemplateSchema.index({ organisationId: 1, projectId: 1, deletedAt: 1 });
BundleTemplateSchema.index(
  { organisationId: 1, isExample: 1 },
  { partialFilterExpression: { isExample: true } }
);

const BundleTemplate = mongoose.model<IBundleTemplate>(
  'BundleTemplate',
  BundleTemplateSchema
);

export default BundleTemplate;
