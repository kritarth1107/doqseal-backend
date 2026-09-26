/**
 * Bundle Engine Types
 * Pure type definitions for the rule engine with no I/O dependencies
 */

export interface DocumentTypeConfig {
  key: string;
  label: string;
  required: boolean | string;
  minCount: number;
  maxCount: number;
  maxAgeDays?: number | null;
}

export interface ProfileValues {
  [key: string]: unknown;
}

export interface RuleConfig {
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
  appliesWhen?: Record<string, unknown> | null;
  field?: string | null;
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
    | 'set_overlap'
    | null;
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
  maxAgeDays?: number | null;
  requiredPeriodMonths?: number | null;
  minConfidence?: number | null;
  requiredPages?: number | null;
  question?: string | null;
  expectedAnswer?: string | null;
  severity: 'blocking' | 'review' | 'info';
  enabled: boolean;
}

export interface ExtractedField {
  value: unknown;
  confidence?: number;
  page?: number;
  bbox?: { x: number; y: number; width: number; height: number };
}

export interface DocumentData {
  documentId: string;
  typeKey: string;
  extractedAt?: Date;
  fields: Record<string, ExtractedField>;
  pageCount?: number;
  isExpired?: boolean;
  confidence?: number;
}

export type ChecklistStatus =
  | 'present'
  | 'missing'
  | 'extra'
  | 'wrong_type'
  | 'insufficient'
  | 'excessive';

export interface ChecklistItem {
  typeKey: string;
  label: string;
  required: boolean;
  received: number;
  minCount: number;
  maxCount: number;
  status: ChecklistStatus;
}

export type ExceptionCategory =
  | 'missing'
  | 'mismatch'
  | 'quality'
  | 'validity'
  | 'custom';

export type ExceptionSeverity = 'blocking' | 'review' | 'info';

export interface Evidence {
  documentId: string;
  page?: number;
  bbox?: { x: number; y: number; width: number; height: number };
  fieldKey?: string;
  value?: unknown;
  confidence?: number;
}

export interface Exception {
  id: string;
  ruleId: string;
  category: ExceptionCategory;
  severity: ExceptionSeverity;
  message: string;
  field?: string;
  values: Record<string, unknown>;
  evidence: Evidence[];
}

export interface FieldProvenance {
  documentId: string;
  documentTypeKey: string;
  fieldPath: string;
  confidence?: number;
  page?: number;
}

export interface ConsolidatedField {
  value: unknown;
  provenance: FieldProvenance[];
}

export interface OutputSchemaField {
  key: string;
  label: string;
  type: 'string' | 'number' | 'boolean' | 'date' | 'array' | 'object';
  sources: Array<{
    documentTypeKey: string;
    fieldPath: string;
    priority: number;
  }>;
}

export type BundleOutcome =
  | 'ready'
  | 'exceptions_found'
  | 'needs_review'
  | 'incomplete'
  | 'failed';

export interface RuleResult {
  ruleId: string;
  passed: boolean;
  exception?: Exception;
}

export interface CompletenessResult {
  checklist: ChecklistItem[];
  exceptions: Exception[];
  allRequiredPresent: boolean;
}

export interface CrossMatchResult {
  results: RuleResult[];
  exceptions: Exception[];
}

export interface ValidityResult {
  results: RuleResult[];
  exceptions: Exception[];
}

export interface ScoringResult {
  outcome: BundleOutcome;
  blockingCount: number;
  reviewCount: number;
  infoCount: number;
  totalExceptions: number;
}
