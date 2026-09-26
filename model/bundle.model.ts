import mongoose, { Schema, Document } from 'mongoose';

export type BundleStatus =
  | 'collecting'
  | 'ready_to_run'
  | 'running'
  | 'exceptions_found'
  | 'needs_review'
  | 'ready'
  | 'failed'
  | 'archived';

export type BundleSource = 'dashboard' | 'api' | 'request_link';

export interface IBundlePipelineSummary {
  evaluatedAt: Date;
  documents: {
    total: number;
    inProgress: number;
    classified: number;
    needsReview: number;
    failed: number;
    unassigned: number;
  };
  checklist: Array<{
    typeKey: string;
    label: string;
    required: boolean;
    received: number;
    minCount: number;
    maxCount: number;
    status: string;
  }>;
  missing: Array<{ typeKey: string; label: string; required: number; received: number }>;
  conflicts: Array<{
    field: string;
    message: string;
    severity: 'review';
    values: Array<{ documentId: string; typeKey: string | null; value: string }>;
    /** Review state (absent on summaries written before conflict review existed) */
    key?: string;
    valuesHash?: string;
    status?: 'open' | 'resolved' | 'dismissed';
    resolution?: {
      action: 'resolve' | 'dismiss';
      actorId: string;
      at: Date;
      value?: string | null;
      reason?: string | null;
    } | null;
  }>;
}

export interface IBundleReview {
  reviewedBy: string;
  reviewedAt: Date;
  note?: string | null;
}

export interface IBundle extends Document {
  bundleId: string;
  organisationId: string;
  projectId?: string | null;
  templateId: string;
  templateVersion: number;
  externalRef?: string | null;
  name?: string | null;
  profile: Record<string, unknown>;
  instructionsOverride?: string | null;
  status: BundleStatus;
  lastRunId?: string | null;
  runCount: number;
  source: BundleSource;
  requestLinkId?: string | null;
  assignees: string[];
  tags: string[];
  dueAt?: Date | null;
  readOnly: boolean;
  /** Latest completeness / consistency summary from the processing pipeline */
  pipeline?: IBundlePipelineSummary | null;
  /** Set when a person marks the bundle reviewed; cleared when it changes */
  review?: IBundleReview | null;
  createdBy: string;
  deletedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const BundleSchema: Schema = new Schema(
  {
    bundleId: {
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
    templateId: {
      type: String,
      required: true,
      index: true,
    },
    templateVersion: {
      type: Number,
      required: true,
    },
    externalRef: {
      type: String,
      default: null,
      index: true,
    },
    name: {
      type: String,
      default: null,
      trim: true,
    },
    profile: {
      type: Schema.Types.Mixed,
      default: {},
    },
    instructionsOverride: {
      type: String,
      default: null,
    },
    status: {
      type: String,
      enum: [
        'collecting',
        'ready_to_run',
        'running',
        'exceptions_found',
        'needs_review',
        'ready',
        'failed',
        'archived',
      ],
      default: 'collecting',
      index: true,
    },
    lastRunId: {
      type: String,
      default: null,
    },
    runCount: {
      type: Number,
      default: 0,
    },
    source: {
      type: String,
      enum: ['dashboard', 'api', 'request_link'],
      default: 'api',
    },
    requestLinkId: {
      type: String,
      default: null,
    },
    assignees: {
      type: [String],
      default: [],
      index: true,
    },
    tags: {
      type: [String],
      default: [],
    },
    dueAt: {
      type: Date,
      default: null,
    },
    readOnly: {
      type: Boolean,
      default: false,
    },
    pipeline: {
      type: Schema.Types.Mixed,
      default: undefined,
    },
    review: {
      type: Schema.Types.Mixed,
      default: undefined,
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
    collection: 'bundles',
  }
);

BundleSchema.index({ organisationId: 1, status: 1, updatedAt: -1 });
BundleSchema.index({ organisationId: 1, projectId: 1, deletedAt: 1 });
BundleSchema.index({ organisationId: 1, templateId: 1, deletedAt: 1 });
BundleSchema.index(
  { organisationId: 1, projectId: 1, externalRef: 1 },
  {
    unique: true,
    partialFilterExpression: {
      externalRef: { $type: 'string' },
      deletedAt: null,
    },
  }
);

const Bundle = mongoose.model<IBundle>('Bundle', BundleSchema);

export default Bundle;
