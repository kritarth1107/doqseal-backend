/**
 * Bundle processing pipeline (classification -> slot assignment -> completeness
 * -> cross-document consistency -> status). Every query is scoped by
 * organisationId, and every step is safe to repeat: a task is identified by
 * its taskId, stale or duplicate tasks are ignored, and events are recorded
 * once per dedupe key.
 */
import { v4 as uuidv4 } from 'uuid';
import Bundle, { BundleStatus, IBundlePipelineSummary } from '../../../model/bundle.model';
import BundleDocument, { ClassificationStatus } from '../../../model/bundleDocument.model';
import BundleTemplateVersion from '../../../model/bundleTemplateVersion.model';
import Document from '../../../model/document.model';
import Extraction from '../../../model/extraction.model';
import Organisation from '../../../model/organisation.model';
import { checkCompleteness } from '../engine/evaluator';
import type { DocumentTypeConfig, DocumentData } from '../engine/types';
import type { BundlePipelineConfig } from '../../../config/bundlePipeline.config';
import { ClassifierError, ClassifyFn, ClassifyResult, ClassifySlot } from './classifier.client';
import { checkConsistency } from './consistency';
import { recordBundleEvent } from './events';
import { annotateConflicts } from './conflicts';
import { isOrgFeatureEnabled } from '../../../utils/orgFeatures.util';

export interface ClassifyTaskMessage {
  v: 1;
  taskId: string;
  organisationId: string;
  bundleId: string;
  documentId: string;
}

export type PublishFn = (queue: string, message: ClassifyTaskMessage) => Promise<boolean>;

export type TaskOutcome =
  | 'classified'
  | 'needs_review'
  | 'failed'
  | 'retry_scheduled'
  | 'stale'
  | 'duplicate'
  | 'skipped'
  | 'not_found';

export class InvalidTaskMessageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidTaskMessageError';
  }
}

export interface BundlePipelineDeps {
  config: BundlePipelineConfig;
  classify: ClassifyFn;
  publish: PublishFn;
  now?: () => Date;
}

const IN_PROGRESS: ClassificationStatus[] = ['pending', 'queued', 'classifying'];
const TERMINAL: ClassificationStatus[] = ['classified', 'needs_review', 'failed'];
/** Statuses the pipeline may move between. Anything else belongs to runs or users. */
const MANAGED_STATUSES: BundleStatus[] = ['collecting', 'ready_to_run', 'needs_review'];
const MAX_TEXT_CHARS = 12_000;

function str(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 200;
}

export function parseTaskMessage(raw: unknown): ClassifyTaskMessage {
  if (!raw || typeof raw !== 'object') throw new InvalidTaskMessageError('message is not an object');
  const m = raw as Record<string, unknown>;
  if (!str(m.taskId) || !str(m.organisationId) || !str(m.bundleId) || !str(m.documentId)) {
    throw new InvalidTaskMessageError('message is missing required fields');
  }
  return {
    v: 1,
    taskId: m.taskId,
    organisationId: m.organisationId,
    bundleId: m.bundleId,
    documentId: m.documentId,
  };
}

function documentTypesToSlots(documentTypes: any[]): ClassifySlot[] {
  return (documentTypes || [])
    .filter((dt) => dt && typeof dt.key === 'string' && dt.key)
    .map((dt) => ({
      key: String(dt.key).slice(0, 80),
      label: String(dt.label || dt.key).slice(0, 200),
      hints: Array.isArray(dt.classificationHints)
        ? dt.classificationHints.filter((h: unknown) => typeof h === 'string').slice(0, 20)
        : [],
    }));
}

function documentTypesToConfig(documentTypes: any[]): DocumentTypeConfig[] {
  return (documentTypes || [])
    .filter((dt) => dt && typeof dt.key === 'string' && dt.key)
    .map((dt) => ({
      key: dt.key,
      label: dt.label || dt.key,
      required: typeof dt.required === 'boolean' || typeof dt.required === 'string' ? dt.required : false,
      minCount: Number.isFinite(dt.minCount) ? dt.minCount : 1,
      maxCount: Number.isFinite(dt.maxCount) ? dt.maxCount : 1,
      maxAgeDays: dt.maxAgeDays ?? null,
    }));
}

export class BundlePipeline {
  private readonly config: BundlePipelineConfig;
  private readonly classify: ClassifyFn;
  private readonly publish: PublishFn;
  private readonly now: () => Date;
  private readonly orgFlagCache = new Map<string, { enabled: boolean; at: number }>();

  constructor(deps: BundlePipelineDeps) {
    this.config = deps.config;
    this.classify = deps.classify;
    this.publish = deps.publish;
    this.now = deps.now ?? (() => new Date());
  }

  // ---------------------------------------------------------------------------
  // Org feature flag
  // ---------------------------------------------------------------------------

  public async isBundlesEnabled(organisationId: string): Promise<boolean> {
    const cached = this.orgFlagCache.get(organisationId);
    const nowMs = this.now().getTime();
    if (cached && nowMs - cached.at < 30_000) return cached.enabled;
    const org = await Organisation.findOne(
      { publicId: organisationId, deletedAt: null },
      { features: 1 }
    ).lean();
    const enabled = Boolean(org) && isOrgFeatureEnabled((org as any).features, 'bundles');
    this.orgFlagCache.set(organisationId, { enabled, at: nowMs });
    return enabled;
  }

  private async loadSnapshot(organisationId: string, templateId: string, version: number) {
    const row = await BundleTemplateVersion.findOne({
      templateId,
      version,
      $or: [{ organisationId }, { organisationId: null }],
    }).lean();
    return row?.snapshot ?? null;
  }

  // ---------------------------------------------------------------------------
  // Enqueue
  // ---------------------------------------------------------------------------

  /**
   * Queues classification for documents newly added to a bundle. Safe to call
   * repeatedly: each call starts a fresh task and older tasks become stale.
   */
  public async enqueueDocuments(
    organisationId: string,
    bundleId: string,
    documentIds: string[]
  ): Promise<{ queued: number; pending: number }> {
    let queued = 0;
    let pending = 0;
    if (!(await this.isBundlesEnabled(organisationId))) return { queued, pending };

    for (const documentId of documentIds) {
      const taskId = uuidv4();
      const res = await BundleDocument.updateOne(
        { organisationId, bundleId, documentId, removedAt: null },
        {
          $set: {
            classification: {
              status: 'queued',
              taskId,
              attempts: 0,
              lastQueuedAt: this.now(),
              classifiedAt: null,
              suggestedTypeKey: null,
              confidence: null,
              reasons: [],
              alternatives: [],
              model: null,
              lastError: null,
            },
          },
        }
      );
      if (res.matchedCount === 0) continue;

      const ok = await this.safePublish(this.config.queue, {
        v: 1,
        taskId,
        organisationId,
        bundleId,
        documentId,
      });
      if (ok) {
        queued++;
        await recordBundleEvent(`queued:${taskId}`, {
          type: 'bundle.document_queued',
          organisationId,
          bundleId,
          documentId,
          data: { taskId },
        });
      } else {
        pending++;
        await BundleDocument.updateOne(
          { organisationId, bundleId, documentId, 'classification.taskId': taskId },
          { $set: { 'classification.status': 'pending' } }
        );
      }
    }

    await this.evaluateBundle(organisationId, bundleId, `enqueue:${uuidv4()}`);
    return { queued, pending };
  }

  private async safePublish(queue: string, message: ClassifyTaskMessage): Promise<boolean> {
    try {
      return await this.publish(queue, message);
    } catch {
      return false;
    }
  }

  // ---------------------------------------------------------------------------
  // Task handling
  // ---------------------------------------------------------------------------

  public async handleTask(raw: unknown): Promise<TaskOutcome> {
    const msg = parseTaskMessage(raw);
    const { taskId, organisationId, bundleId, documentId } = msg;

    const link = await BundleDocument.findOne({
      organisationId,
      bundleId,
      documentId,
      removedAt: null,
    }).lean();
    if (!link || !link.classification) return 'not_found';
    const state = link.classification;
    if (state.taskId !== taskId) return 'stale';
    if (TERMINAL.includes(state.status)) return 'duplicate';

    const bundle = await Bundle.findOne({ bundleId, organisationId, deletedAt: null }).lean();
    if (!bundle) return this.fail(msg, state.attempts, 'bundle_unavailable');

    if (!(await this.isBundlesEnabled(organisationId))) {
      await BundleDocument.updateOne(
        { organisationId, bundleId, documentId, 'classification.taskId': taskId },
        { $set: { 'classification.status': 'pending' } }
      );
      return 'skipped';
    }

    const document = await Document.findOne({ documentId, organisationId, deletedAt: null }).lean();
    if (!document) return this.fail(msg, state.attempts, 'document_unavailable');
    if (document.status === 'failed') return this.fail(msg, state.attempts, 'extraction_failed');

    const extraction =
      document.status === 'completed'
        ? await Extraction.findOne({ documentId, organisationId }).sort({ version: -1, createdAt: -1 }).lean()
        : null;
    if (!extraction) {
      const attempts = (state.attempts || 0) + 1;
      if (attempts > this.config.maxExtractionWaitAttempts) {
        return this.fail(msg, attempts, 'extraction_not_ready');
      }
      return this.scheduleRetry(msg, attempts, 'waiting_for_extraction');
    }

    const snapshot = await this.loadSnapshot(organisationId, bundle.templateId, bundle.templateVersion);
    const slots = documentTypesToSlots(snapshot?.documentTypes as any[]);
    if (slots.length === 0) return this.fail(msg, state.attempts, 'template_has_no_document_types');

    const claim = await BundleDocument.updateOne(
      {
        organisationId,
        bundleId,
        documentId,
        removedAt: null,
        'classification.taskId': taskId,
        'classification.status': { $in: IN_PROGRESS },
      },
      { $set: { 'classification.status': 'classifying' } }
    );
    if (claim.matchedCount === 0) return 'stale';

    const data = ((extraction as any).data || {}) as Record<string, unknown>;
    const text = typeof (extraction as any).ocrFullText === 'string' ? (extraction as any).ocrFullText : null;

    let result: ClassifyResult;
    try {
      result = await this.classify({
        requestId: taskId,
        organisationId,
        bundleId,
        documentId,
        slots,
        document: {
          documentType: typeof data.document_type === 'string' ? data.document_type : null,
          text: text ? text.slice(0, MAX_TEXT_CHARS) : null,
          fields: data,
        },
      });
    } catch (err) {
      const retryable = err instanceof ClassifierError ? err.retryable : true;
      const attempts = (state.attempts || 0) + 1;
      const reason = err instanceof Error ? err.message.slice(0, 200) : 'classification_error';
      if (retryable && attempts < this.config.maxAiAttempts) {
        return this.scheduleRetry(msg, attempts, reason);
      }
      return this.fail(msg, attempts, reason);
    }

    if (result.organisationId !== organisationId || result.documentId !== documentId) {
      return this.fail(msg, state.attempts, 'response_mismatch');
    }

    const slotKeys = new Set(slots.map((s) => s.key));
    const slot = result.slot && slotKeys.has(result.slot) ? result.slot : null;
    const confidence = Number.isFinite(result.confidence) ? Math.max(0, Math.min(1, result.confidence)) : 0;
    const userAssigned = link.assignedBy === 'user' && Boolean(link.assignedTypeKey);
    const lowConfidence = !slot || confidence < this.config.minConfidence;
    const status: ClassificationStatus = userAssigned || !lowConfidence ? 'classified' : 'needs_review';

    const set: Record<string, unknown> = {
      'classification.status': status,
      'classification.classifiedAt': this.now(),
      'classification.suggestedTypeKey': slot,
      'classification.confidence': confidence,
      'classification.reasons': (result.reasons || []).slice(0, 5).map((r) => String(r).slice(0, 300)),
      'classification.alternatives': (result.alternatives || [])
        .filter((a) => a && slotKeys.has(a.slot))
        .slice(0, 3),
      'classification.model': result.model ?? null,
      'classification.lastError': null,
      keyFields: sanitiseKeyFields(result.keyFields),
    };
    if (!userAssigned) {
      set.assignedTypeKey = lowConfidence ? null : slot;
      set.classificationConfidence = confidence;
      set.assignedBy = 'auto';
    }

    const applied = await BundleDocument.updateOne(
      {
        organisationId,
        bundleId,
        documentId,
        removedAt: null,
        'classification.taskId': taskId,
        'classification.status': 'classifying',
      },
      { $set: set }
    );
    if (applied.matchedCount === 0) return 'stale';

    await recordBundleEvent(`classified:${taskId}`, {
      type: 'bundle.document_classified',
      organisationId,
      bundleId,
      documentId,
      data: {
        taskId,
        typeKey: userAssigned ? link.assignedTypeKey : slot,
        suggestedTypeKey: slot,
        confidence,
        status,
        assignedBy: userAssigned ? 'user' : 'auto',
      },
    });

    await this.evaluateBundle(organisationId, bundleId, `task:${taskId}`);
    return status === 'classified' ? 'classified' : 'needs_review';
  }

  private async scheduleRetry(
    msg: ClassifyTaskMessage,
    attempts: number,
    reason: string
  ): Promise<TaskOutcome> {
    const { taskId, organisationId, bundleId, documentId } = msg;
    const res = await BundleDocument.updateOne(
      {
        organisationId,
        bundleId,
        documentId,
        removedAt: null,
        'classification.taskId': taskId,
        'classification.status': { $in: IN_PROGRESS },
      },
      {
        $set: {
          'classification.status': 'queued',
          'classification.attempts': attempts,
          'classification.lastQueuedAt': this.now(),
          'classification.lastError': reason,
        },
      }
    );
    if (res.matchedCount === 0) return 'stale';

    const ok = await this.safePublish(this.config.retryQueue, msg);
    if (!ok) {
      await BundleDocument.updateOne(
        { organisationId, bundleId, documentId, 'classification.taskId': taskId },
        { $set: { 'classification.status': 'pending' } }
      );
    }
    return 'retry_scheduled';
  }

  private async fail(msg: ClassifyTaskMessage, attempts: number, reason: string): Promise<TaskOutcome> {
    const { taskId, organisationId, bundleId, documentId } = msg;
    const res = await BundleDocument.updateOne(
      {
        organisationId,
        bundleId,
        documentId,
        'classification.taskId': taskId,
        'classification.status': { $in: IN_PROGRESS },
      },
      {
        $set: {
          'classification.status': 'failed',
          'classification.attempts': attempts,
          'classification.lastError': reason,
        },
      }
    );
    if (res.matchedCount === 0) return 'stale';

    await recordBundleEvent(`failed:${taskId}`, {
      type: 'bundle.document_classification_failed',
      organisationId,
      bundleId,
      documentId,
      data: { taskId, reason },
    });
    await this.evaluateBundle(organisationId, bundleId, `task:${taskId}`);
    return 'failed';
  }

  // ---------------------------------------------------------------------------
  // Bundle evaluation (completeness + consistency + status)
  // ---------------------------------------------------------------------------

  public async evaluateBundle(
    organisationId: string,
    bundleId: string,
    trigger: string,
    depth = 0
  ): Promise<{ status: BundleStatus | null; changed: boolean; target: BundleStatus | null }> {
    const bundle = await Bundle.findOne({ bundleId, organisationId, deletedAt: null }).lean();
    if (!bundle) return { status: null, changed: false, target: null };

    const snapshot = await this.loadSnapshot(organisationId, bundle.templateId, bundle.templateVersion);
    const docTypes = documentTypesToConfig((snapshot?.documentTypes as any[]) || []);

    const links = await BundleDocument.find({ organisationId, bundleId, removedAt: null }).lean();

    const assigned: DocumentData[] = links
      .filter((l) => l.assignedTypeKey)
      .map((l) => ({ documentId: l.documentId, typeKey: l.assignedTypeKey as string, fields: {} }));
    const completeness = checkCompleteness(docTypes, assigned, (bundle.profile as any) || {});
    const missing = completeness.checklist
      .filter((c) => c.status === 'missing' || c.status === 'insufficient')
      .map((c) => ({ typeKey: c.typeKey, label: c.label, required: c.minCount, received: c.received }));

    const detected = checkConsistency(
      links
        .filter((l) => l.keyFields && typeof l.keyFields === 'object')
        .map((l) => ({
          documentId: l.documentId,
          typeKey: l.assignedTypeKey ?? null,
          keyFields: l.keyFields as Record<string, string>,
        }))
    );
    const conflicts = await annotateConflicts(organisationId, bundleId, detected);
    const openConflicts = conflicts.filter((c) => c.status === 'open');

    const statusOf = (l: any): ClassificationStatus | null => l.classification?.status ?? null;
    const counts = {
      total: links.length,
      inProgress: links.filter((l) => IN_PROGRESS.includes(statusOf(l) as ClassificationStatus)).length,
      classified: links.filter((l) => statusOf(l) === 'classified').length,
      needsReview: links.filter((l) => statusOf(l) === 'needs_review').length,
      failed: links.filter((l) => statusOf(l) === 'failed').length,
      unassigned: links.filter((l) => !l.assignedTypeKey).length,
    };

    // Documents that are not being classified and still have no slot need a person.
    const idleUnassigned = links.filter(
      (l) => !l.assignedTypeKey && !IN_PROGRESS.includes(statusOf(l) as ClassificationStatus)
    ).length;

    let target: BundleStatus;
    if (counts.total === 0 || counts.inProgress > 0 || missing.length > 0) {
      target = 'collecting';
    } else if (
      openConflicts.length > 0 ||
      counts.needsReview > 0 ||
      counts.failed > 0 ||
      idleUnassigned > 0
    ) {
      target = 'needs_review';
    } else {
      target = 'ready_to_run';
    }

    const summary: IBundlePipelineSummary = {
      evaluatedAt: this.now(),
      documents: counts,
      checklist: completeness.checklist,
      missing,
      conflicts,
    };

    const previousConflictFields = new Set(
      ((bundle as any).pipeline?.conflicts || []).map((c: { field: string }) => c.field)
    );
    const newConflictFields = conflicts.map((c) => c.field).filter((f) => !previousConflictFields.has(f));

    const from = bundle.status as BundleStatus;
    const canMove = MANAGED_STATUSES.includes(from) && !bundle.readOnly && from !== target;

    if (!canMove) {
      await Bundle.updateOne({ bundleId, organisationId, deletedAt: null }, { $set: { pipeline: summary } });
    } else {
      const moved = await Bundle.findOneAndUpdate(
        { bundleId, organisationId, deletedAt: null, status: from },
        { $set: { status: target, pipeline: summary } },
        { new: true }
      ).lean();
      if (!moved) {
        // Someone else changed the status in between; evaluate again once.
        if (depth < 1) return this.evaluateBundle(organisationId, bundleId, trigger, depth + 1);
        return { status: null, changed: false, target };
      }
      await recordBundleEvent(`status:${bundleId}:${trigger}:${from}->${target}`, {
        type: 'bundle.status_changed',
        organisationId,
        bundleId,
        from,
        to: target,
        data: {
          trigger,
          missing: missing.map((m) => m.typeKey),
          conflicts: openConflicts.map((c) => c.field),
        },
      });
    }

    if (newConflictFields.length > 0) {
      await recordBundleEvent(`conflicts:${bundleId}:${trigger}:${newConflictFields.join(',')}`, {
        type: 'bundle.conflicts_detected',
        organisationId,
        bundleId,
        data: { trigger, fields: newConflictFields },
      });
    }

    return { status: canMove ? target : from, changed: canMove, target };
  }

  // ---------------------------------------------------------------------------
  // Sweeper: re-queues tasks that were never published or got lost
  // ---------------------------------------------------------------------------

  public async sweep(limit = 50): Promise<number> {
    const staleBefore = new Date(this.now().getTime() - this.config.staleAfterMs);
    const candidates = await BundleDocument.find({
      removedAt: null,
      $or: [
        { 'classification.status': 'pending' },
        {
          'classification.status': { $in: ['queued', 'classifying'] },
          'classification.lastQueuedAt': { $lt: staleBefore },
        },
      ],
    })
      .limit(limit)
      .lean();

    const maxTotal = this.config.maxAiAttempts + this.config.maxExtractionWaitAttempts;
    let requeued = 0;

    for (const link of candidates) {
      const state = link.classification;
      if (!state?.taskId) continue;
      if (!(await this.isBundlesEnabled(link.organisationId))) continue;

      const msgBase = {
        organisationId: link.organisationId,
        bundleId: link.bundleId,
        documentId: link.documentId,
      };
      const attempts = (state.attempts || 0) + (state.status === 'pending' ? 0 : 1);
      if (attempts > maxTotal) {
        await this.fail({ v: 1, taskId: state.taskId, ...msgBase }, attempts, 'gave_up_after_retries');
        continue;
      }

      const taskId = uuidv4();
      const claim = await BundleDocument.updateOne(
        {
          ...msgBase,
          removedAt: null,
          'classification.taskId': state.taskId,
          'classification.status': state.status,
        },
        {
          $set: {
            'classification.status': 'queued',
            'classification.taskId': taskId,
            'classification.attempts': attempts,
            'classification.lastQueuedAt': this.now(),
          },
        }
      );
      if (claim.matchedCount === 0) continue;

      const ok = await this.safePublish(this.config.queue, { v: 1, taskId, ...msgBase });
      if (ok) {
        requeued++;
      } else {
        await BundleDocument.updateOne(
          { ...msgBase, 'classification.taskId': taskId },
          { $set: { 'classification.status': 'pending' } }
        );
      }
    }
    return requeued;
  }
}

function sanitiseKeyFields(raw: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [key, value] of Object.entries(raw as Record<string, unknown>).slice(0, 20)) {
    if (typeof value !== 'string' || !value.trim()) continue;
    let v = value.trim().slice(0, 300);
    if (/aadhaar/i.test(key)) {
      const digits = v.replace(/\D/g, '');
      if (digits.length < 4) continue;
      v = digits.slice(-4);
    }
    out[key.slice(0, 60)] = v;
  }
  return out;
}
