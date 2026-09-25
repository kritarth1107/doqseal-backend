/**
 * Rule Evaluator for Bundle Engine
 * Evaluates appliesWhen conditions, completeness, and validity checks.
 * Pure functions with no I/O.
 */

import { v4 as uuidv4 } from 'uuid';
import type {
  DocumentTypeConfig,
  ProfileValues,
  RuleConfig,
  DocumentData,
  ChecklistItem,
  ChecklistStatus,
  Exception,
  CompletenessResult,
  ValidityResult,
  RuleResult,
  ExtractedField,
} from './types';
import { getComparisonValues, executeRuleMethod } from './rules';
import { normaliseDate } from './normalisers';

/**
 * Evaluates an appliesWhen condition against profile values.
 */
export function evaluateAppliesWhen(
  condition: Record<string, unknown> | null | undefined,
  profile: ProfileValues
): boolean {
  if (!condition || Object.keys(condition).length === 0) {
    return true;
  }

  for (const [key, expected] of Object.entries(condition)) {
    const actual = profile[key];

    if (key.startsWith('$')) {
      switch (key) {
        case '$and':
          if (Array.isArray(expected)) {
            return expected.every((c) =>
              evaluateAppliesWhen(c as Record<string, unknown>, profile)
            );
          }
          break;
        case '$or':
          if (Array.isArray(expected)) {
            return expected.some((c) =>
              evaluateAppliesWhen(c as Record<string, unknown>, profile)
            );
          }
          break;
        case '$not':
          return !evaluateAppliesWhen(expected as Record<string, unknown>, profile);
      }
      continue;
    }

    if (typeof expected === 'object' && expected !== null && !Array.isArray(expected)) {
      const ops = expected as Record<string, unknown>;
      for (const [op, opValue] of Object.entries(ops)) {
        switch (op) {
          case '$eq':
            if (actual !== opValue) return false;
            break;
          case '$ne':
            if (actual === opValue) return false;
            break;
          case '$in':
            if (!Array.isArray(opValue) || !opValue.includes(actual)) return false;
            break;
          case '$nin':
            if (Array.isArray(opValue) && opValue.includes(actual)) return false;
            break;
          case '$gt':
            if (typeof actual !== 'number' || actual <= (opValue as number)) return false;
            break;
          case '$gte':
            if (typeof actual !== 'number' || actual < (opValue as number)) return false;
            break;
          case '$lt':
            if (typeof actual !== 'number' || actual >= (opValue as number)) return false;
            break;
          case '$lte':
            if (typeof actual !== 'number' || actual > (opValue as number)) return false;
            break;
          case '$exists':
            if (opValue && actual === undefined) return false;
            if (!opValue && actual !== undefined) return false;
            break;
        }
      }
    } else if (Array.isArray(expected)) {
      if (!expected.includes(actual)) return false;
    } else {
      if (actual !== expected) return false;
    }
  }

  return true;
}

/**
 * Evaluates whether a document type is required based on condition and profile.
 */
export function isDocTypeRequired(
  required: boolean | string,
  profile: ProfileValues
): boolean {
  if (typeof required === 'boolean') {
    return required;
  }

  if (typeof required === 'string') {
    try {
      const condition = JSON.parse(required);
      return evaluateAppliesWhen(condition, profile);
    } catch {
      return false;
    }
  }

  return true;
}

/**
 * Checks completeness of documents against the template's document types.
 */
export function checkCompleteness(
  documentTypes: DocumentTypeConfig[],
  documents: DocumentData[],
  profile: ProfileValues
): CompletenessResult {
  const checklist: ChecklistItem[] = [];
  const exceptions: Exception[] = [];

  const countByType = new Map<string, number>();
  for (const doc of documents) {
    const current = countByType.get(doc.typeKey) || 0;
    countByType.set(doc.typeKey, current + 1);
  }

  for (const docType of documentTypes) {
    const isRequired = isDocTypeRequired(docType.required, profile);
    const received = countByType.get(docType.key) || 0;

    let status: ChecklistStatus;

    if (received === 0 && isRequired) {
      status = 'missing';
    } else if (received < docType.minCount && isRequired) {
      status = 'insufficient';
    } else if (received > docType.maxCount) {
      status = 'excessive';
    } else if (received > 0) {
      status = 'present';
    } else {
      status = 'present';
    }

    checklist.push({
      typeKey: docType.key,
      label: docType.label,
      required: isRequired,
      received,
      minCount: docType.minCount,
      maxCount: docType.maxCount,
      status,
    });

    if (status === 'missing') {
      exceptions.push({
        id: uuidv4(),
        ruleId: `completeness:${docType.key}`,
        category: 'missing',
        severity: 'blocking',
        message: `Required document missing: ${docType.label}`,
        values: { typeKey: docType.key, required: docType.minCount, received: 0 },
        evidence: [],
      });
    } else if (status === 'insufficient') {
      exceptions.push({
        id: uuidv4(),
        ruleId: `completeness:${docType.key}`,
        category: 'missing',
        severity: 'blocking',
        message: `Insufficient documents: ${docType.label} (${received}/${docType.minCount})`,
        values: { typeKey: docType.key, required: docType.minCount, received },
        evidence: [],
      });
    }
  }

  const allRequiredPresent = exceptions.filter((e) => e.severity === 'blocking').length === 0;

  return { checklist, exceptions, allRequiredPresent };
}

/**
 * Checks document validity (expiry, recency, confidence, page count).
 */
export function checkValidity(
  rules: RuleConfig[],
  documents: DocumentData[],
  profile: ProfileValues
): ValidityResult {
  const results: RuleResult[] = [];
  const exceptions: Exception[] = [];

  const validityRules = rules.filter(
    (r) => r.category === 'validity' && r.enabled && evaluateAppliesWhen(r.appliesWhen, profile)
  );

  for (const rule of validityRules) {
    const targetDocs = rule.documents?.length
      ? documents.filter((d) => rule.documents!.includes(d.typeKey))
      : documents;

    for (const doc of targetDocs) {
      let passed = true;
      let message: string | undefined;

      if (rule.maxAgeDays && doc.extractedAt) {
        const now = new Date();
        const docDate = new Date(doc.extractedAt);
        const ageInDays = (now.getTime() - docDate.getTime()) / (1000 * 60 * 60 * 24);

        if (ageInDays > rule.maxAgeDays) {
          passed = false;
          message = `Document is ${Math.round(ageInDays)} days old, exceeds ${rule.maxAgeDays} day limit`;
        }
      }

      if (passed && rule.minConfidence !== null && rule.minConfidence !== undefined) {
        if (doc.confidence !== undefined && doc.confidence < rule.minConfidence) {
          passed = false;
          message = `Document confidence ${(doc.confidence * 100).toFixed(1)}% below threshold ${(rule.minConfidence * 100).toFixed(1)}%`;
        }
      }

      if (passed && rule.requiredPages) {
        if (doc.pageCount !== undefined && doc.pageCount < rule.requiredPages) {
          passed = false;
          message = `Document has ${doc.pageCount} pages, requires ${rule.requiredPages}`;
        }
      }

      results.push({ ruleId: rule.id, passed, exception: undefined });

      if (!passed) {
        const exception: Exception = {
          id: uuidv4(),
          ruleId: rule.id,
          category: 'validity',
          severity: rule.severity,
          message: message || `Validity check failed: ${rule.name}`,
          values: { documentId: doc.documentId, typeKey: doc.typeKey },
          evidence: [{ documentId: doc.documentId }],
        };
        exceptions.push(exception);
        results[results.length - 1].exception = exception;
      }
    }
  }

  return { results, exceptions };
}

/**
 * Checks document quality (low confidence fields, unreadable pages).
 */
export function checkQuality(
  rules: RuleConfig[],
  documents: DocumentData[],
  profile: ProfileValues
): ValidityResult {
  const results: RuleResult[] = [];
  const exceptions: Exception[] = [];

  const qualityRules = rules.filter(
    (r) => r.category === 'quality' && r.enabled && evaluateAppliesWhen(r.appliesWhen, profile)
  );

  for (const rule of qualityRules) {
    const targetDocs = rule.documents?.length
      ? documents.filter((d) => rule.documents!.includes(d.typeKey))
      : documents;

    for (const doc of targetDocs) {
      let passed = true;
      let message: string | undefined;
      const lowConfidenceFields: string[] = [];

      if (rule.minConfidence !== null && rule.minConfidence !== undefined) {
        for (const [fieldKey, field] of Object.entries(doc.fields)) {
          if (
            field.confidence !== undefined &&
            field.confidence < (rule.minConfidence as number)
          ) {
            lowConfidenceFields.push(fieldKey);
          }
        }

        if (lowConfidenceFields.length > 0) {
          passed = false;
          message = `Low confidence fields: ${lowConfidenceFields.join(', ')}`;
        }
      }

      results.push({ ruleId: rule.id, passed, exception: undefined });

      if (!passed) {
        const exception: Exception = {
          id: uuidv4(),
          ruleId: rule.id,
          category: 'quality',
          severity: rule.severity,
          message: message || `Quality check failed: ${rule.name}`,
          field: lowConfidenceFields[0],
          values: { documentId: doc.documentId, lowConfidenceFields },
          evidence: lowConfidenceFields.map((f) => ({
            documentId: doc.documentId,
            fieldKey: f,
            confidence: doc.fields[f]?.confidence,
          })),
        };
        exceptions.push(exception);
        results[results.length - 1].exception = exception;
      }
    }
  }

  return { results, exceptions };
}

/**
 * Executes cross-match rules across documents.
 */
export function executeCrossMatchRules(
  rules: RuleConfig[],
  documents: DocumentData[],
  profile: ProfileValues
): ValidityResult {
  const results: RuleResult[] = [];
  const exceptions: Exception[] = [];

  const crossMatchRules = rules.filter(
    (r) =>
      r.category === 'cross_match' &&
      r.enabled &&
      r.field &&
      evaluateAppliesWhen(r.appliesWhen, profile)
  );

  const docMap = new Map<string, { fields: Record<string, any>; typeKey: string }>();
  for (const doc of documents) {
    docMap.set(doc.documentId, { fields: doc.fields, typeKey: doc.typeKey });
  }

  for (const rule of crossMatchRules) {
    const values = getComparisonValues(docMap, rule.field!, rule.documents);

    if (values.length < 2) {
      results.push({ ruleId: rule.id, passed: true });
      continue;
    }

    const result = executeRuleMethod(rule, values);

    results.push({ ruleId: rule.id, passed: result.passed, exception: undefined });

    if (!result.passed) {
      const exception: Exception = {
        id: uuidv4(),
        ruleId: rule.id,
        category: 'mismatch',
        severity: rule.severity,
        message: result.message || `Cross-match failed: ${rule.name}`,
        field: rule.field ?? undefined,
        values: result.values,
        evidence: result.evidence,
      };
      exceptions.push(exception);
      results[results.length - 1].exception = exception;
    }
  }

  return { results, exceptions };
}

/**
 * Main evaluation function that runs all checks.
 */
export interface EvaluationInput {
  documentTypes: DocumentTypeConfig[];
  rules: RuleConfig[];
  documents: DocumentData[];
  profile: ProfileValues;
}

export interface EvaluationResult {
  completeness: CompletenessResult;
  crossMatch: ValidityResult;
  validity: ValidityResult;
  quality: ValidityResult;
  allExceptions: Exception[];
}

export function evaluate(input: EvaluationInput): EvaluationResult {
  const completeness = checkCompleteness(input.documentTypes, input.documents, input.profile);

  const crossMatch = executeCrossMatchRules(input.rules, input.documents, input.profile);

  const validity = checkValidity(input.rules, input.documents, input.profile);

  const quality = checkQuality(input.rules, input.documents, input.profile);

  const allExceptions = [
    ...completeness.exceptions,
    ...crossMatch.exceptions,
    ...validity.exceptions,
    ...quality.exceptions,
  ];

  return {
    completeness,
    crossMatch,
    validity,
    quality,
    allExceptions,
  };
}
