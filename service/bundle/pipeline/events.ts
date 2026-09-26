import { createHash } from 'crypto';
import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import BundleEvent, { BundleEventType } from '../../../model/bundleEvent.model';
import auditService from '../../audit.service';
import logger from '../../../utils/logger.util';

export interface BundlePipelineEvent {
  type: BundleEventType;
  organisationId: string;
  bundleId: string;
  documentId?: string | null;
  from?: string | null;
  to?: string | null;
  data?: Record<string, unknown>;
}

/**
 * In-process bus for bundle pipeline events. Listeners (for example a future
 * webhook dispatcher) subscribe with `bundleEvents.on('event', fn)`.
 */
export const bundleEvents = new EventEmitter();
bundleEvents.setMaxListeners(50);

function isDuplicateKeyError(err: unknown): boolean {
  return Boolean(err && typeof err === 'object' && (err as { code?: number }).code === 11000);
}

/**
 * Records an event once per dedupeKey: stored in bundle_events, written to the
 * audit log and emitted on the in-process bus. Returns false when the event
 * was already recorded (a retry or duplicate message).
 */
export async function recordBundleEvent(
  dedupeKey: string,
  event: BundlePipelineEvent
): Promise<boolean> {
  const key = dedupeKey.length > 180 ? `sha256:${createHash('sha256').update(dedupeKey).digest('hex')}` : dedupeKey;
  try {
    await BundleEvent.create({
      eventId: uuidv4(),
      organisationId: event.organisationId,
      bundleId: event.bundleId,
      type: event.type,
      dedupeKey: key,
      documentId: event.documentId ?? null,
      from: event.from ?? null,
      to: event.to ?? null,
      data: event.data ?? {},
    });
  } catch (err) {
    if (isDuplicateKeyError(err)) return false;
    throw err;
  }

  try {
    await auditService.logEvent({
      actorId: 'system',
      organisationId: event.organisationId,
      action: event.type,
      resourceType: 'bundle',
      resourceId: event.bundleId,
      metadata: {
        documentId: event.documentId ?? undefined,
        from: event.from ?? undefined,
        to: event.to ?? undefined,
        ...(event.data ?? {}),
      },
    });
  } catch (err) {
    logger.error('bundle pipeline: audit write failed', {
      error: err instanceof Error ? err.message : String(err),
      type: event.type,
    });
  }

  try {
    bundleEvents.emit('event', event);
    bundleEvents.emit(event.type, event);
  } catch (err) {
    logger.error('bundle pipeline: event listener failed', {
      error: err instanceof Error ? err.message : String(err),
      type: event.type,
    });
  }
  return true;
}
