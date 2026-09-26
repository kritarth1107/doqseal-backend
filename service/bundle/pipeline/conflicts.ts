/**
 * Identity and review state for cross-document conflicts. A person can resolve
 * (pick the correct value) or dismiss a conflict; the decision is stored in
 * bundle_exception_actions against the conflict key and a hash of the values.
 * If the values change later (a document is added, replaced or reclassified),
 * the hash no longer matches, the old decision lapses and the conflict opens
 * again.
 */
import { createHash } from 'crypto';
import BundleExceptionAction from '../../../model/bundleExceptionAction.model';

/** runId used for decisions taken on pipeline conflicts (not tied to a run) */
export const PIPELINE_RUN_ID = 'pipeline';

export type ConflictReviewStatus = 'open' | 'resolved' | 'dismissed';

export interface ConflictValue {
  documentId: string;
  typeKey: string | null;
  value: string;
}

export interface ConflictResolution {
  action: 'resolve' | 'dismiss';
  actorId: string;
  at: Date;
  value?: string | null;
  reason?: string | null;
}

export function conflictKey(field: string): string {
  return `conflict:${field}`;
}

export function conflictValuesHash(values: ConflictValue[]): string {
  const parts = values
    .map((v) => `${v.documentId}\u0000${String(v.value).trim().toLowerCase()}`)
    .sort();
  return createHash('sha256').update(parts.join('\n')).digest('hex').slice(0, 32);
}

interface ConflictLike {
  field: string;
  values: ConflictValue[];
}

/**
 * Adds key, valuesHash, status and resolution to each conflict, and lapses
 * decisions whose values no longer match a current conflict on that field.
 */
export async function annotateConflicts<T extends ConflictLike>(
  organisationId: string,
  bundleId: string,
  conflicts: T[]
): Promise<Array<T & { key: string; valuesHash: string; status: ConflictReviewStatus; resolution: ConflictResolution | null }>> {
  const actions = await BundleExceptionAction.find({
    organisationId,
    bundleId,
    runId: PIPELINE_RUN_ID,
    status: 'active',
  })
    .sort({ createdAt: -1 })
    .lean();

  const annotated = conflicts.map((c) => {
    const key = conflictKey(c.field);
    const valuesHash = conflictValuesHash(c.values);
    const match = actions.find((a) => a.exceptionKey === key && a.valuesHash === valuesHash);
    const resolution: ConflictResolution | null = match
      ? {
          action: match.type === 'override' ? 'dismiss' : 'resolve',
          actorId: match.actorId,
          at: (match as any).createdAt,
          value: (match as any).resolvedValue ?? null,
          reason: match.reason ?? null,
        }
      : null;
    const status: ConflictReviewStatus = !resolution
      ? 'open'
      : resolution.action === 'dismiss'
        ? 'dismissed'
        : 'resolved';
    return { ...c, key, valuesHash, status, resolution };
  });

  // A decision lapses once its conflict is gone or its values changed.
  const live = new Set(annotated.map((c) => `${c.key}\u0000${c.valuesHash}`));
  const stale = actions
    .filter((a) => a.exceptionKey.startsWith('conflict:') && !live.has(`${a.exceptionKey}\u0000${a.valuesHash}`))
    .map((a) => a.actionId);
  if (stale.length > 0) {
    await BundleExceptionAction.updateMany(
      { organisationId, bundleId, actionId: { $in: stale }, status: 'active' },
      { $set: { status: 'lapsed' } }
    );
  }

  return annotated;
}
