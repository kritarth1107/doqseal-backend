import { z } from 'zod';

// ── Document Types ─────────────────────────────────────
export const InlineFieldSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  type: z.enum(['string', 'number', 'boolean', 'date', 'array']).default('string'),
  required: z.boolean().optional().default(false),
});

export const DocumentTypeSchema = z.object({
  key: z.string().min(1).regex(/^[a-z][a-z0-9_]*$/, 'Key must be lowercase snake_case'),
  label: z.string().min(1),
  required: z.union([z.boolean(), z.string()]).default(true),
  minCount: z.number().int().min(0).default(1),
  maxCount: z.number().int().min(1).default(1),
  acceptedFormats: z.array(z.string()).optional().default([]),
  maxAgeDays: z.number().int().positive().optional().nullable(),
  schemaRef: z.string().optional().nullable(),
  inlineFields: z.array(InlineFieldSchema).optional().default([]),
  classificationHints: z.array(z.string()).optional().default([]),
});

// ── Profile Fields ─────────────────────────────────────
export const ProfileFieldSchema = z.object({
  key: z.string().min(1).regex(/^[a-z][a-z0-9_]*$/, 'Key must be lowercase snake_case'),
  label: z.string().min(1),
  type: z.enum(['string', 'number', 'boolean', 'select']).default('string'),
  options: z.array(z.string()).optional().default([]),
  required: z.boolean().optional().default(false),
  default: z.union([z.string(), z.number(), z.boolean()]).optional().nullable(),
});

// ── Rules ──────────────────────────────────────────────
export const RuleParamsSchema = z.object({
  threshold: z.number().min(0).max(1).optional(),
  tolerancePct: z.number().min(0).max(100).optional(),
  windowDays: z.number().int().positive().optional(),
  components: z.array(z.string()).optional(),
  pattern: z.string().optional(),
  min: z.number().optional(),
  max: z.number().optional(),
  minOverlap: z.number().int().min(0).optional(),
});

export const RuleSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional().default(''),
  category: z.enum([
    'completeness',
    'cross_match',
    'validity',
    'quality',
    'extraction',
    'custom_ai',
  ]),
  appliesWhen: z.record(z.string(), z.unknown()).optional().nullable(),
  field: z.string().optional().nullable(),
  documents: z.array(z.string()).optional().default([]),
  method: z
    .enum([
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
    ])
    .optional()
    .nullable(),
  params: RuleParamsSchema.optional().default({}),
  maxAgeDays: z.number().int().positive().optional().nullable(),
  requiredPeriodMonths: z.number().int().positive().optional().nullable(),
  minConfidence: z.number().min(0).max(1).optional().nullable(),
  requiredPages: z.number().int().positive().optional().nullable(),
  question: z.string().optional().nullable(),
  expectedAnswer: z.string().optional().nullable(),
  severity: z.enum(['blocking', 'review', 'info']).default('review'),
  enabled: z.boolean().default(true),
  origin: z.enum(['manual', 'compiled_from_instructions']).optional().default('manual'),
  sourceSpan: z
    .object({
      start: z.number().int().min(0),
      end: z.number().int().min(0),
    })
    .optional()
    .nullable(),
});

// ── Output Schema ──────────────────────────────────────
export const OutputSchemaSourceSchema = z.object({
  documentTypeKey: z.string().min(1),
  fieldPath: z.string().min(1),
  priority: z.number().int().default(0),
});

export const OutputSchemaFieldSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  type: z.enum(['string', 'number', 'boolean', 'date', 'array', 'object']).default('string'),
  sources: z.array(OutputSchemaSourceSchema).default([]),
});

// ── Automation ─────────────────────────────────────────
export const AutomationActionSchema = z.object({
  outcome: z.enum(['ready', 'exceptions_found', 'needs_review', 'failed']),
  action: z.enum(['webhook', 'assign', 'request_missing', 'mark_readonly']),
  config: z.record(z.string(), z.unknown()).optional().default({}),
});

export const AutomationSchema = z.object({
  trigger: z
    .enum(['manual', 'on_complete', 'on_document_change', 'on_request_link_submitted'])
    .default('manual'),
  debounceSeconds: z.number().int().min(0).default(60),
  actions: z.array(AutomationActionSchema).optional().default([]),
});

// ── Draft ──────────────────────────────────────────────
export const DraftSchema = z.object({
  instructions: z.string().optional().default(''),
  documentTypes: z.array(DocumentTypeSchema).default([]),
  profileFields: z.array(ProfileFieldSchema).default([]),
  rules: z.array(RuleSchema).default([]),
  outputSchema: z.array(OutputSchemaFieldSchema).default([]),
  automation: AutomationSchema.optional().nullable(),
  fieldMapping: z.record(z.string(), z.string()).optional().default({}),
});

// ── Template API ───────────────────────────────────────
export const CreateBundleTemplateBody = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional().default(''),
  projectId: z.string().optional().nullable(),
  draft: DraftSchema.optional(),
});

export const UpdateBundleTemplateBody = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional(),
  draft: DraftSchema.optional(),
  status: z.enum(['draft', 'archived']).optional(),
});

export const BundleTemplateIdParams = z.object({
  templateId: z.string().min(1),
});

export const BundleTemplateListQuery = z.object({
  projectId: z.string().optional(),
  status: z.enum(['draft', 'published', 'archived']).optional(),
  includeExamples: z.string().optional(),
  page: z.string().optional(),
  limit: z.string().optional(),
});

export const PublishTemplateBody = z.object({
  changelog: z.string().max(1000).optional(),
});

export const CloneTemplateBody = z.object({
  name: z.string().min(1).max(200),
  projectId: z.string().optional().nullable(),
});

// ── Bundle API ─────────────────────────────────────────
export const CreateBundleBody = z.object({
  templateId: z.string().min(1),
  projectId: z.string().optional().nullable(),
  externalRef: z.string().max(500).optional().nullable(),
  name: z.string().max(500).optional().nullable(),
  profile: z.record(z.string(), z.unknown()).optional().default({}),
  instructionsOverride: z.string().max(10000).optional().nullable(),
  source: z.enum(['dashboard', 'api', 'request_link']).optional().default('api'),
});

export const UpdateBundleBody = z.object({
  name: z.string().max(500).optional().nullable(),
  profile: z.record(z.string(), z.unknown()).optional(),
  instructionsOverride: z.string().max(10000).optional().nullable(),
  assignees: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
  dueAt: z.string().datetime().optional().nullable(),
});

export const BundleIdParams = z.object({
  bundleId: z.string().min(1),
});

export const BundleListQuery = z.object({
  projectId: z.string().optional(),
  templateId: z.string().optional(),
  status: z.string().optional(),
  externalRef: z.string().optional(),
  assignee: z.string().optional(),
  updatedSince: z.string().optional(),
  page: z.string().optional(),
  limit: z.string().optional(),
});

export const DeleteBundleQuery = z.object({
  mode: z.enum(['cascade', 'detach']).optional().default('detach'),
});

// ── Bundle Documents ───────────────────────────────────
export const AttachDocumentsBody = z.object({
  documentIds: z.array(z.string().min(1)).min(1).max(100),
  typeKey: z.string().optional().nullable(),
});

export const BundleDocumentParams = z.object({
  bundleId: z.string().min(1),
  documentId: z.string().min(1),
});

export const UpdateBundleDocumentBody = z.object({
  typeKey: z.string().min(1),
});

// ── Bundle Runs ────────────────────────────────────────
export const CreateBundleRunBody = z.object({
  templateVersion: z.enum(['pinned', 'latest']).optional().default('pinned'),
  trigger: z.enum(['manual', 'api']).optional().default('api'),
});

export const BundleRunIdParams = z.object({
  bundleId: z.string().min(1),
  runId: z.string().min(1),
});

// ── Exceptions ─────────────────────────────────────────
export const ExceptionIdParams = z.object({
  bundleId: z.string().min(1),
  exceptionId: z.string().min(1),
});

export const ResolveExceptionBody = z.object({
  type: z.enum(['corrected', 'document_replaced', 'document_added']),
  correctedValue: z.unknown().optional(),
  documentId: z.string().optional(),
});

export const OverrideExceptionBody = z.object({
  reason: z.string().min(1).max(2000),
});
