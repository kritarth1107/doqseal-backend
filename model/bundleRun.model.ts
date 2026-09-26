import mongoose, { Schema, Document } from 'mongoose';

export type BundleRunStatus = 'queued' | 'running' | 'completed' | 'failed';

export type BundleRunTrigger =
  | 'manual'
  | 'api'
  | 'auto_on_complete'
  | 'auto_on_document_change'
  | 'scheduled'
  | 'rerun';

export type BundleRunOutcome =
  | 'ready'
  | 'exceptions_found'
  | 'needs_review'
  | 'incomplete'
  | 'failed';

export type ChecklistItemStatus =
  | 'present'
  | 'missing'
  | 'extra'
  | 'wrong_type'
  | 'insufficient'
  | 'excessive';

export type ExceptionCategory =
  | 'missing'
  | 'mismatch'
  | 'quality'
  | 'validity'
  | 'custom';

export type ExceptionSeverity = 'blocking' | 'review' | 'info';

export type ExceptionStatus = 'open' | 'resolved' | 'overridden';

export interface IStepResult {
  step: string;
  status: 'completed' | 'skipped' | 'failed';
  startedAt?: Date;
  finishedAt?: Date;
  durationMs?: number;
  error?: string;
  metadata?: Record<string, unknown>;
}

export interface IChecklistItem {
  typeKey: string;
  label: string;
  required: boolean;
  received: number;
  minCount: number;
  maxCount: number;
  status: ChecklistItemStatus;
}

export interface IEvidence {
  documentId: string;
  page?: number;
  bbox?: { x: number; y: number; width: number; height: number };
  fieldKey?: string;
  value?: unknown;
  confidence?: number;
}

export interface IException {
  id: string;
  ruleId: string;
  category: ExceptionCategory;
  severity: ExceptionSeverity;
  message: string;
  field?: string;
  values: Record<string, unknown>;
  evidence: IEvidence[];
  status: ExceptionStatus;
  resolution?: {
    type: 'corrected' | 'overridden' | 'document_replaced' | 'document_added';
    reason?: string;
    resolvedBy?: string;
    resolvedAt?: Date;
  };
}

export interface IFieldProvenance {
  documentId: string;
  documentTypeKey: string;
  fieldPath: string;
  confidence?: number;
  page?: number;
}

export interface IRecordField {
  value: unknown;
  provenance: IFieldProvenance[];
}

export interface IBundleRun extends Document {
  runId: string;
  bundleId: string;
  organisationId: string;
  templateVersion: number;
  trigger: BundleRunTrigger;
  status: BundleRunStatus;
  stepResults: IStepResult[];
  checklist: IChecklistItem[];
  exceptions: IException[];
  record: Record<string, IRecordField>;
  summary?: string | null;
  outcome?: BundleRunOutcome | null;
  inputHash?: string | null;
  startedAt?: Date | null;
  finishedAt?: Date | null;
  durationMs?: number | null;
}

const StepResultSchema = new Schema(
  {
    step: { type: String, required: true },
    status: {
      type: String,
      enum: ['completed', 'skipped', 'failed'],
      required: true,
    },
    startedAt: { type: Date, default: null },
    finishedAt: { type: Date, default: null },
    durationMs: { type: Number, default: null },
    error: { type: String, default: null },
    metadata: { type: Schema.Types.Mixed, default: {} },
  },
  { _id: false }
);

const ChecklistItemSchema = new Schema(
  {
    typeKey: { type: String, required: true },
    label: { type: String, required: true },
    required: { type: Boolean, default: true },
    received: { type: Number, default: 0 },
    minCount: { type: Number, default: 1 },
    maxCount: { type: Number, default: 1 },
    status: {
      type: String,
      enum: ['present', 'missing', 'extra', 'wrong_type', 'insufficient', 'excessive'],
      required: true,
    },
  },
  { _id: false }
);

const EvidenceSchema = new Schema(
  {
    documentId: { type: String, required: true },
    page: { type: Number, default: null },
    bbox: {
      type: {
        x: Number,
        y: Number,
        width: Number,
        height: Number,
      },
      default: null,
    },
    fieldKey: { type: String, default: null },
    value: { type: Schema.Types.Mixed, default: null },
    confidence: { type: Number, default: null },
  },
  { _id: false }
);

const ResolutionSchema = new Schema(
  {
    type: {
      type: String,
      enum: ['corrected', 'overridden', 'document_replaced', 'document_added'],
      required: true,
    },
    reason: { type: String, default: null },
    resolvedBy: { type: String, default: null },
    resolvedAt: { type: Date, default: null },
  },
  { _id: false }
);

const ExceptionSchema = new Schema(
  {
    id: { type: String, required: true },
    ruleId: { type: String, required: true },
    category: {
      type: String,
      enum: ['missing', 'mismatch', 'quality', 'validity', 'custom'],
      required: true,
    },
    severity: {
      type: String,
      enum: ['blocking', 'review', 'info'],
      required: true,
    },
    message: { type: String, required: true },
    field: { type: String, default: null },
    values: { type: Schema.Types.Mixed, default: {} },
    evidence: { type: [EvidenceSchema], default: [] },
    status: {
      type: String,
      enum: ['open', 'resolved', 'overridden'],
      default: 'open',
    },
    resolution: { type: ResolutionSchema, default: null },
  },
  { _id: false }
);

const BundleRunSchema: Schema = new Schema(
  {
    runId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
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
    templateVersion: {
      type: Number,
      required: true,
    },
    trigger: {
      type: String,
      enum: [
        'manual',
        'api',
        'auto_on_complete',
        'auto_on_document_change',
        'scheduled',
        'rerun',
      ],
      required: true,
    },
    status: {
      type: String,
      enum: ['queued', 'running', 'completed', 'failed'],
      default: 'queued',
      index: true,
    },
    stepResults: {
      type: [StepResultSchema],
      default: [],
    },
    checklist: {
      type: [ChecklistItemSchema],
      default: [],
    },
    exceptions: {
      type: [ExceptionSchema],
      default: [],
    },
    record: {
      type: Schema.Types.Mixed,
      default: {},
    },
    summary: {
      type: String,
      default: null,
    },
    outcome: {
      type: String,
      enum: ['ready', 'exceptions_found', 'needs_review', 'incomplete', 'failed'],
      default: null,
    },
    inputHash: {
      type: String,
      default: null,
    },
    startedAt: {
      type: Date,
      default: null,
    },
    finishedAt: {
      type: Date,
      default: null,
    },
    durationMs: {
      type: Number,
      default: null,
    },
  },
  {
    timestamps: true,
    collection: 'bundle_runs',
  }
);

BundleRunSchema.index({ organisationId: 1, bundleId: 1, createdAt: -1 });
BundleRunSchema.index({ bundleId: 1, status: 1 });

const BundleRun = mongoose.model<IBundleRun>('BundleRun', BundleRunSchema);

export default BundleRun;
