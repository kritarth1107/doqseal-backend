/**
 * Scoring and Outcome Determination for Bundle Engine
 * Calculates the final bundle outcome based on exceptions.
 * Pure functions with no I/O.
 */

import type {
  Exception,
  ChecklistItem,
  BundleOutcome,
  ScoringResult,
} from './types';

export type { ScoringResult };

/**
 * Determines the bundle outcome based on exceptions and checklist.
 */
export function determineOutcome(
  exceptions: Exception[],
  checklist: ChecklistItem[]
): ScoringResult {
  let blockingCount = 0;
  let reviewCount = 0;
  let infoCount = 0;

  for (const exception of exceptions) {
    switch (exception.severity) {
      case 'blocking':
        blockingCount++;
        break;
      case 'review':
        reviewCount++;
        break;
      case 'info':
        infoCount++;
        break;
    }
  }

  const hasIncomplete = checklist.some(
    (item) => item.required && (item.status === 'missing' || item.status === 'insufficient')
  );

  let outcome: BundleOutcome;

  if (hasIncomplete) {
    outcome = 'incomplete';
  } else if (blockingCount > 0) {
    outcome = 'exceptions_found';
  } else if (reviewCount > 0) {
    outcome = 'needs_review';
  } else {
    outcome = 'ready';
  }

  return {
    outcome,
    blockingCount,
    reviewCount,
    infoCount,
    totalExceptions: exceptions.length,
  };
}

/**
 * Filters exceptions to only include open (unresolved) ones.
 */
export function filterOpenExceptions(exceptions: Exception[]): Exception[] {
  return exceptions;
}

/**
 * Groups exceptions by severity.
 */
export function groupExceptionsBySeverity(
  exceptions: Exception[]
): Record<string, Exception[]> {
  return {
    blocking: exceptions.filter((e) => e.severity === 'blocking'),
    review: exceptions.filter((e) => e.severity === 'review'),
    info: exceptions.filter((e) => e.severity === 'info'),
  };
}

/**
 * Groups exceptions by category.
 */
export function groupExceptionsByCategory(
  exceptions: Exception[]
): Record<string, Exception[]> {
  return {
    missing: exceptions.filter((e) => e.category === 'missing'),
    mismatch: exceptions.filter((e) => e.category === 'mismatch'),
    quality: exceptions.filter((e) => e.category === 'quality'),
    validity: exceptions.filter((e) => e.category === 'validity'),
    custom: exceptions.filter((e) => e.category === 'custom'),
  };
}

/**
 * Calculates a completion percentage based on checklist.
 */
export function calculateCompletionPercentage(checklist: ChecklistItem[]): number {
  const requiredItems = checklist.filter((item) => item.required);

  if (requiredItems.length === 0) return 100;

  const presentCount = requiredItems.filter(
    (item) => item.status === 'present' || item.status === 'excessive'
  ).length;

  return Math.round((presentCount / requiredItems.length) * 100);
}

/**
 * Generates a summary message for the bundle status.
 */
export function generateStatusSummary(
  outcome: BundleOutcome,
  scoring: ScoringResult,
  checklist: ChecklistItem[]
): string {
  const completionPct = calculateCompletionPercentage(checklist);
  const presentCount = checklist.filter(
    (c) => c.status === 'present' || c.status === 'excessive'
  ).length;
  const totalRequired = checklist.filter((c) => c.required).length;

  switch (outcome) {
    case 'ready':
      return `All checks passed. ${presentCount}/${totalRequired} documents received.`;

    case 'needs_review':
      return `${scoring.reviewCount} item(s) require review. ${presentCount}/${totalRequired} documents received.`;

    case 'exceptions_found':
      return `${scoring.blockingCount} blocking exception(s) found. ${presentCount}/${totalRequired} documents received.`;

    case 'incomplete':
      const missing = checklist.filter(
        (c) => c.required && (c.status === 'missing' || c.status === 'insufficient')
      );
      return `${missing.length} required document(s) missing. ${completionPct}% complete.`;

    case 'failed':
      return 'Bundle evaluation failed.';

    default:
      return `Status: ${outcome}`;
  }
}
