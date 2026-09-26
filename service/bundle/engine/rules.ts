/**
 * Rule Methods for Bundle Engine
 * Pure functions implementing each rule comparison method.
 * No I/O - only value comparisons and transformations.
 */

import {
  normaliseName,
  normaliseNameTokens,
  normaliseDate,
  datesMatch,
  normaliseAmount,
  normaliseString,
  parseAddressComponents,
  normaliseTestName,
} from './normalisers';
import type { ExtractedField, Evidence, RuleConfig } from './types';

export interface ComparisonValue {
  documentId: string;
  typeKey: string;
  fieldKey: string;
  value: unknown;
  confidence?: number;
  page?: number;
}

export interface RuleMethodResult {
  passed: boolean;
  values: Record<string, unknown>;
  evidence: Evidence[];
  message?: string;
}

/**
 * Extracts comparison values from documents for a given field.
 */
export function getComparisonValues(
  documents: Map<string, { fields: Record<string, ExtractedField>; typeKey: string }>,
  fieldKey: string,
  targetDocTypes?: string[]
): ComparisonValue[] {
  const values: ComparisonValue[] = [];

  for (const [documentId, doc] of documents) {
    if (targetDocTypes && !targetDocTypes.includes(doc.typeKey)) {
      continue;
    }

    const field = doc.fields[fieldKey];
    if (field && field.value !== undefined && field.value !== null && field.value !== '') {
      values.push({
        documentId,
        typeKey: doc.typeKey,
        fieldKey,
        value: field.value,
        confidence: field.confidence,
        page: field.page,
      });
    }
  }

  return values;
}

/**
 * Creates evidence from comparison values.
 */
function toEvidence(cv: ComparisonValue): Evidence {
  return {
    documentId: cv.documentId,
    page: cv.page,
    fieldKey: cv.fieldKey,
    value: cv.value,
    confidence: cv.confidence,
  };
}

/**
 * Exact match: all values must be identical after normalisation.
 */
export function ruleExact(values: ComparisonValue[], params?: { normaliser?: string }): RuleMethodResult {
  if (values.length < 2) {
    return {
      passed: true,
      values: {},
      evidence: values.map(toEvidence),
    };
  }

  const normaliser = params?.normaliser || 'string';
  let normalise: (v: unknown) => unknown;

  switch (normaliser) {
    case 'name':
      normalise = normaliseName;
      break;
    case 'date':
      normalise = normaliseDate;
      break;
    case 'amount':
      normalise = normaliseAmount;
      break;
    default:
      normalise = normaliseString;
  }

  const normalised = values.map((v) => ({
    ...v,
    normalisedValue: normalise(v.value),
  }));

  const firstValue = normalised[0].normalisedValue;
  const allMatch = normalised.every((v) => v.normalisedValue === firstValue);

  const valueMap: Record<string, unknown> = {};
  for (const v of normalised) {
    valueMap[v.typeKey] = v.value;
  }

  return {
    passed: allMatch,
    values: valueMap,
    evidence: normalised.map(toEvidence),
    message: allMatch ? undefined : `Values do not match: ${JSON.stringify(valueMap)}`,
  };
}

/**
 * Similarity match: string similarity above threshold.
 */
export function ruleSimilarity(
  values: ComparisonValue[],
  params?: { threshold?: number }
): RuleMethodResult {
  if (values.length < 2) {
    return { passed: true, values: {}, evidence: values.map(toEvidence) };
  }

  const threshold = params?.threshold ?? 0.85;

  const tokens = values.map((v) => ({
    ...v,
    tokens: normaliseNameTokens(v.value),
  }));

  let minSimilarity = 1;

  for (let i = 0; i < tokens.length; i++) {
    for (let j = i + 1; j < tokens.length; j++) {
      const sim = jaccardSimilarity(tokens[i].tokens, tokens[j].tokens);
      minSimilarity = Math.min(minSimilarity, sim);
    }
  }

  const passed = minSimilarity >= threshold;

  const valueMap: Record<string, unknown> = {};
  for (const v of values) {
    valueMap[v.typeKey] = v.value;
  }

  return {
    passed,
    values: valueMap,
    evidence: values.map(toEvidence),
    message: passed
      ? undefined
      : `Similarity ${(minSimilarity * 100).toFixed(1)}% below threshold ${(threshold * 100).toFixed(1)}%`,
  };
}

/**
 * Jaccard similarity between two token sets.
 */
function jaccardSimilarity(tokens1: string[], tokens2: string[]): number {
  if (tokens1.length === 0 && tokens2.length === 0) return 1;
  if (tokens1.length === 0 || tokens2.length === 0) return 0;

  const set1 = new Set(tokens1);
  const set2 = new Set(tokens2);

  let intersection = 0;
  for (const t of set1) {
    if (set2.has(t)) intersection++;
  }

  const union = set1.size + set2.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Numeric tolerance: values within percentage tolerance.
 */
export function ruleNumericTolerance(
  values: ComparisonValue[],
  params?: { tolerancePct?: number }
): RuleMethodResult {
  if (values.length < 2) {
    return { passed: true, values: {}, evidence: values.map(toEvidence) };
  }

  const tolerancePct = params?.tolerancePct ?? 15;

  const amounts = values.map((v) => ({
    ...v,
    amount: normaliseAmount(v.value),
  }));

  const validAmounts = amounts.filter((a) => a.amount !== null);
  if (validAmounts.length < 2) {
    return {
      passed: true,
      values: {},
      evidence: amounts.map(toEvidence),
      message: 'Insufficient numeric values for comparison',
    };
  }

  const avg =
    validAmounts.reduce((sum, v) => sum + (v.amount as number), 0) /
    validAmounts.length;

  const allWithinTolerance = validAmounts.every((v) => {
    const diff = Math.abs((v.amount as number) - avg);
    const pctDiff = avg === 0 ? (diff === 0 ? 0 : Infinity) : (diff / avg) * 100;
    return pctDiff <= tolerancePct;
  });

  const valueMap: Record<string, unknown> = {};
  for (const v of amounts) {
    valueMap[v.typeKey] = v.value;
  }

  return {
    passed: allWithinTolerance,
    values: valueMap,
    evidence: amounts.map(toEvidence),
    message: allWithinTolerance
      ? undefined
      : `Values exceed ${tolerancePct}% tolerance`,
  };
}

/**
 * Date window: dates within N days of each other.
 */
export function ruleDateWindow(
  values: ComparisonValue[],
  params?: { windowDays?: number }
): RuleMethodResult {
  if (values.length < 2) {
    return { passed: true, values: {}, evidence: values.map(toEvidence) };
  }

  const windowDays = params?.windowDays ?? 90;

  const dates = values.map((v) => ({
    ...v,
    date: normaliseDate(v.value),
  }));

  const validDates = dates.filter((d) => d.date !== null && d.date.length === 10);
  if (validDates.length < 2) {
    const yearOnlyMatch = dates.every((d, _, arr) =>
      arr.every((d2) => datesMatch(d.value, d2.value))
    );
    return {
      passed: yearOnlyMatch,
      values: {},
      evidence: dates.map(toEvidence),
    };
  }

  const timestamps = validDates.map((d) => new Date(d.date as string).getTime());
  const maxDiff =
    Math.max(...timestamps) - Math.min(...timestamps);
  const daysDiff = maxDiff / (1000 * 60 * 60 * 24);

  const passed = daysDiff <= windowDays;

  const valueMap: Record<string, unknown> = {};
  for (const v of dates) {
    valueMap[v.typeKey] = v.value;
  }

  return {
    passed,
    values: valueMap,
    evidence: dates.map(toEvidence),
    message: passed
      ? undefined
      : `Dates differ by ${Math.round(daysDiff)} days, exceeds ${windowDays} day window`,
  };
}

/**
 * Presence: field must be present in specified documents.
 */
export function rulePresence(
  values: ComparisonValue[],
  requiredDocTypes: string[]
): RuleMethodResult {
  const presentTypes = new Set(values.map((v) => v.typeKey));
  const missingTypes = requiredDocTypes.filter((t) => !presentTypes.has(t));

  const valueMap: Record<string, unknown> = {};
  for (const v of values) {
    valueMap[v.typeKey] = v.value;
  }

  return {
    passed: missingTypes.length === 0,
    values: valueMap,
    evidence: values.map(toEvidence),
    message:
      missingTypes.length > 0
        ? `Field missing from: ${missingTypes.join(', ')}`
        : undefined,
  };
}

/**
 * Component match: address components must match.
 */
export function ruleComponentMatch(
  values: ComparisonValue[],
  params?: { components?: string[] }
): RuleMethodResult {
  if (values.length < 2) {
    return { passed: true, values: {}, evidence: values.map(toEvidence) };
  }

  const requiredComponents = params?.components ?? ['pincode', 'city'];

  const parsed = values.map((v) => ({
    ...v,
    components: parseAddressComponents(v.value),
  }));

  const mismatches: string[] = [];

  for (const component of requiredComponents) {
    const compValues = parsed
      .map((p) => (p.components as Record<string, string | undefined>)[component])
      .filter(Boolean);

    if (compValues.length >= 2) {
      const first = compValues[0];
      if (!compValues.every((v) => v === first)) {
        mismatches.push(component);
      }
    }
  }

  const valueMap: Record<string, unknown> = {};
  for (const v of values) {
    valueMap[v.typeKey] = v.value;
  }

  return {
    passed: mismatches.length === 0,
    values: valueMap,
    evidence: values.map(toEvidence),
    message:
      mismatches.length > 0
        ? `Address components do not match: ${mismatches.join(', ')}`
        : undefined,
  };
}

/**
 * Regex: value must match pattern.
 */
export function ruleRegex(
  values: ComparisonValue[],
  params?: { pattern?: string }
): RuleMethodResult {
  if (!params?.pattern) {
    return { passed: true, values: {}, evidence: values.map(toEvidence) };
  }

  const regex = new RegExp(params.pattern, 'i');
  const failed = values.filter((v) => !regex.test(String(v.value)));

  const valueMap: Record<string, unknown> = {};
  for (const v of values) {
    valueMap[v.typeKey] = v.value;
  }

  return {
    passed: failed.length === 0,
    values: valueMap,
    evidence: values.map(toEvidence),
    message:
      failed.length > 0
        ? `Values do not match pattern: ${failed.map((f) => f.typeKey).join(', ')}`
        : undefined,
  };
}

/**
 * Sum equals: sum of values equals expected total.
 */
export function ruleSumEquals(
  values: ComparisonValue[],
  params?: { min?: number; max?: number }
): RuleMethodResult {
  const amounts = values
    .map((v) => normaliseAmount(v.value))
    .filter((a): a is number => a !== null);

  const sum = amounts.reduce((acc, a) => acc + a, 0);
  const min = params?.min ?? 0;
  const max = params?.max ?? Infinity;

  const passed = sum >= min && sum <= max;

  const valueMap: Record<string, unknown> = {};
  for (const v of values) {
    valueMap[v.typeKey] = v.value;
  }

  return {
    passed,
    values: { ...valueMap, _sum: sum },
    evidence: values.map(toEvidence),
    message: passed
      ? undefined
      : `Sum ${sum} outside expected range [${min}, ${max}]`,
  };
}

/**
 * Count between: count of items in expected range.
 */
export function ruleCountBetween(
  count: number,
  params?: { min?: number; max?: number }
): RuleMethodResult {
  const min = params?.min ?? 1;
  const max = params?.max ?? Infinity;
  const passed = count >= min && count <= max;

  return {
    passed,
    values: { count },
    evidence: [],
    message: passed
      ? undefined
      : `Count ${count} outside expected range [${min}, ${max}]`,
  };
}

/**
 * Set overlap: checks if sets of values have sufficient overlap.
 */
export function ruleSetOverlap(
  values1: unknown[],
  values2: unknown[],
  params?: { minOverlap?: number; normalise?: 'test' | 'string' }
): RuleMethodResult {
  const minOverlap = params?.minOverlap ?? 1;
  const normalise = params?.normalise === 'test' ? normaliseTestName : normaliseString;

  const set1 = new Set(values1.map((v) => normalise(v)));
  const set2 = new Set(values2.map((v) => normalise(v)));

  let overlap = 0;
  for (const v of set1) {
    if (set2.has(v)) overlap++;
  }

  const passed = overlap >= minOverlap;

  return {
    passed,
    values: {
      set1: [...set1],
      set2: [...set2],
      overlap,
    },
    evidence: [],
    message: passed
      ? undefined
      : `Set overlap ${overlap} below minimum ${minOverlap}`,
  };
}

/**
 * Dispatches to the appropriate rule method based on config.
 */
export function executeRuleMethod(
  rule: RuleConfig,
  values: ComparisonValue[],
  additionalContext?: { values2?: unknown[] }
): RuleMethodResult {
  switch (rule.method) {
    case 'exact':
      return ruleExact(values, {
        normaliser: rule.field?.includes('name') ? 'name' : 'string',
      });

    case 'similarity':
      return ruleSimilarity(values, rule.params);

    case 'numeric_tolerance':
      return ruleNumericTolerance(values, rule.params);

    case 'date_window':
      return ruleDateWindow(values, rule.params);

    case 'presence':
      return rulePresence(values, rule.documents || []);

    case 'component_match':
      return ruleComponentMatch(values, rule.params);

    case 'regex':
      return ruleRegex(values, rule.params);

    case 'sum_equals':
      return ruleSumEquals(values, rule.params);

    case 'count_between':
      return ruleCountBetween(values.length, rule.params);

    case 'set_overlap':
      if (!additionalContext?.values2) {
        return { passed: true, values: {}, evidence: [] };
      }
      return ruleSetOverlap(
        values.map((v) => v.value),
        additionalContext.values2,
        { ...rule.params, normalise: 'test' }
      );

    default:
      return { passed: true, values: {}, evidence: values.map(toEvidence) };
  }
}
