/**
 * Bundle Intelligence Rule Engine
 * A pure-function engine for validating document bundles.
 * No I/O dependencies - all functions operate on data passed in.
 */

export * from './types';
export * from './normalisers';
export * from './rules';
export * from './evaluator';
export * from './consolidate';
export * from './scoring';

import type {
  DocumentTypeConfig,
  ProfileValues,
  RuleConfig,
  DocumentData,
  OutputSchemaField,
  ChecklistItem,
  Exception,
  ConsolidatedField,
  BundleOutcome,
} from './types';
import { evaluate, EvaluationResult } from './evaluator';
import { consolidateRecord, applyFieldMapping, hashRecord } from './consolidate';
import { determineOutcome, generateStatusSummary, ScoringResult } from './scoring';

export interface BundleEngineInput {
  documentTypes: DocumentTypeConfig[];
  rules: RuleConfig[];
  documents: DocumentData[];
  profile: ProfileValues;
  outputSchema: OutputSchemaField[];
  fieldMapping?: Record<string, string>;
}

export interface BundleEngineResult {
  checklist: ChecklistItem[];
  exceptions: Exception[];
  record: Record<string, ConsolidatedField>;
  outcome: BundleOutcome;
  scoring: ScoringResult;
  summary: string;
  inputHash: string;
}

/**
 * Main entry point for the bundle engine.
 * Runs all validations and produces the final result.
 */
export function runBundleEngine(input: BundleEngineInput): BundleEngineResult {
  const evaluation = evaluate({
    documentTypes: input.documentTypes,
    rules: input.rules,
    documents: input.documents,
    profile: input.profile,
  });

  let record = consolidateRecord(input.outputSchema, input.documents);

  if (input.fieldMapping) {
    record = applyFieldMapping(record, input.fieldMapping);
  }

  const scoring = determineOutcome(
    evaluation.allExceptions,
    evaluation.completeness.checklist
  );

  const summary = generateStatusSummary(
    scoring.outcome,
    scoring,
    evaluation.completeness.checklist
  );

  const inputHash = hashRecord(record);

  return {
    checklist: evaluation.completeness.checklist,
    exceptions: evaluation.allExceptions,
    record,
    outcome: scoring.outcome,
    scoring,
    summary,
    inputHash,
  };
}
