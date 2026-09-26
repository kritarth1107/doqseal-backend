import { v4 as uuidv4 } from 'uuid';
import Bundle, { IBundle, BundleStatus, BundleSource } from '../model/bundle.model';
import BundleDocument from '../model/bundleDocument.model';
import BundleTemplate from '../model/bundleTemplate.model';
import BundleTemplateVersion from '../model/bundleTemplateVersion.model';
import BundleRun from '../model/bundleRun.model';
import Document from '../model/document.model';
import { assertOrgRole } from '../utils/org-access.util';
import { visibilityFilter } from '../utils/visibility.util';
import auditService from './audit.service';
import quotaService from './quota.service';
import documentService from './document.service';
import BundleExceptionAction from '../model/bundleExceptionAction.model';
import AuditEvent from '../model/auditEvent.model';
import User from '../model/user.model';
import logger from '../utils/logger.util';
import {
  notifyDocumentsAdded,
  notifyBundleChanged,
  evaluateBundleNow,
} from './bundle/pipeline/runtime';
import { recordBundleEvent } from './bundle/pipeline/events';
import { PIPELINE_RUN_ID, conflictKey } from './bundle/pipeline/conflicts';
import {
  NotFoundError,
  ForbiddenError,
  ValidationError,
  ConflictError,
} from '../utils/errors.util';

export interface CreateBundleParams {
  userId: string;
  organisationId: string;
  templateId: string;
  projectId?: string | null;
  externalRef?: string | null;
  name?: string | null;
  profile?: Record<string, unknown>;
  instructionsOverride?: string | null;
  source?: BundleSource;
}

export interface ListBundlesParams {
  userId: string;
  organisationId: string;
  projectId?: string | null;
  templateId?: string;
  status?: string;
  externalRef?: string;
  assignee?: string;
  updatedSince?: string;
  q?: string;
  page?: number;
  limit?: number;
}

export interface UpdateBundleParams {
  userId: string;
  organisationId: string;
  bundleId: string;
  name?: string | null;
  profile?: Record<string, unknown>;
  instructionsOverride?: string | null;
  assignees?: string[];
  tags?: string[];
  dueAt?: string | null;
}

export interface AttachDocumentsParams {
  userId: string;
  organisationId: string;
  bundleId: string;
  documentIds: string[];
  typeKey?: string | null;
}

export interface UpdateBundleDocumentParams {
  userId: string;
  organisationId: string;
  bundleId: string;
  documentId: string;
  typeKey: string;
}

export interface CreateBundleRunParams {
  userId: string;
  organisationId: string;
  bundleId: string;
  templateVersion?: 'pinned' | 'latest';
  trigger?: 'manual' | 'api';
}

export interface ConflictActionParams {
  userId: string;
  organisationId: string;
  bundleId: string;
  field: string;
  valuesHash: string;
  action: 'resolve' | 'dismiss' | 'reopen';
  value?: string | null;
  reason?: string | null;
}

export interface MarkReviewedParams {
  userId: string;
  organisationId: string;
  bundleId: string;
  note?: string | null;
}

/** Statuses a person can mark reviewed from (after a fresh evaluation). */
const REVIEWABLE_STATUS = 'ready_to_run';

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function openConflictCount(pipeline: any): number {
  return ((pipeline?.conflicts as any[]) || []).filter((c) => (c?.status ?? 'open') === 'open').length;
}

/** Compact progress numbers for list views, from the stored pipeline summary. */
function progressOf(pipeline: any) {
  if (!pipeline || !Array.isArray(pipeline.checklist)) return null;
  const required = pipeline.checklist.filter((c: any) => c.required);
  const met = required.filter((c: any) => c.status !== 'missing' && c.status !== 'insufficient');
  const docs = pipeline.documents || {};
  return {
    requiredSlots: required.length,
    requiredSlotsMet: met.length,
    missing: Array.isArray(pipeline.missing) ? pipeline.missing.length : 0,
    openConflicts: openConflictCount(pipeline),
    needsAttention: (docs.needsReview || 0) + (docs.failed || 0),
    inProgress: docs.inProgress || 0,
    evaluatedAt: pipeline.evaluatedAt ?? null,
  };
}

function documentTypesForClient(documentTypes: any[] | undefined) {
  return (documentTypes || [])
    .filter((d) => d && typeof d.key === 'string')
    .map((d) => ({
      key: d.key,
      label: d.label || d.key,
      required: d.required === true,
      conditional: typeof d.required === 'string',
      minCount: Number.isFinite(d.minCount) ? d.minCount : 1,
      maxCount: Number.isFinite(d.maxCount) ? d.maxCount : 1,
    }));
}

export class BundleService {
  private async loadSnapshot(organisationId: string, templateId: string, version: number) {
    const row = await BundleTemplateVersion.findOne({
      templateId,
      version,
      $or: [{ organisationId }, { organisationId: null }],
    }).lean();
    return (row?.snapshot as any) ?? null;
  }

  /**
   * A reviewed bundle that changes (documents added, removed or re-sorted) is
   * no longer reviewed: it goes back to needs_review and is evaluated again.
   */
  private async clearReview(organisationId: string, bundleId: string, actorId: string, reason: string) {
    const cleared = await Bundle.findOneAndUpdate(
      {
        bundleId,
        organisationId,
        deletedAt: null,
        status: 'ready',
        'review.reviewedAt': { $exists: true },
      },
      { $set: { status: 'needs_review' }, $unset: { review: '' } },
      { new: true }
    ).lean();
    if (!cleared) return false;
    await recordBundleEvent(`review_cleared:${bundleId}:${uuidv4()}`, {
      type: 'bundle.review_cleared',
      organisationId,
      bundleId,
      from: 'ready',
      to: 'needs_review',
      actorId,
      data: { reason },
    });
    return true;
  }

  public async createBundle(params: CreateBundleParams) {
    await assertOrgRole(params.userId, params.organisationId, 'member');

    const template = await BundleTemplate.findOne({
      templateId: params.templateId,
      deletedAt: null,
      $or: [
        { organisationId: params.organisationId },
        { organisationId: null, isExample: true },
      ],
    }).lean();

    if (!template) {
      throw new NotFoundError('Template', params.templateId);
    }

    if (template.latestVersion === 0) {
      throw new ValidationError('Template must be published before creating bundles');
    }

    if (params.externalRef) {
      const existing = await Bundle.findOne({
        organisationId: params.organisationId,
        projectId: params.projectId || null,
        externalRef: params.externalRef,
        deletedAt: null,
      }).lean();

      if (existing) {
        return this.toBundleResponse(existing);
      }
    }

    const bundleId = uuidv4();

    const bundle = await Bundle.create({
      bundleId,
      organisationId: params.organisationId,
      projectId: params.projectId || null,
      templateId: params.templateId,
      templateVersion: template.latestVersion,
      externalRef: params.externalRef || null,
      name: params.name || null,
      profile: params.profile || {},
      instructionsOverride: params.instructionsOverride || null,
      status: 'collecting',
      runCount: 0,
      source: params.source || 'api',
      assignees: [],
      tags: [],
      readOnly: false,
      createdBy: params.userId,
    });

    await auditService.logEvent({
      actorId: params.userId,
      organisationId: params.organisationId,
      action: 'bundle.create',
      resourceType: 'bundle',
      resourceId: bundleId,
      metadata: {
        templateId: params.templateId,
        templateVersion: template.latestVersion,
        externalRef: params.externalRef,
        projectId: params.projectId,
      },
    });

    return this.toBundleResponse(bundle);
  }

  public async getBundle(
    userId: string,
    organisationId: string,
    bundleId: string
  ) {
    await assertOrgRole(userId, organisationId, 'member');

    let bundle = await Bundle.findOne({
      bundleId,
      organisationId,
      deletedAt: null,
    }).lean();

    if (!bundle) {
      throw new NotFoundError('Bundle', bundleId);
    }

    // Summaries from before conflict review (or none at all) are refreshed once.
    const summary: any = (bundle as any).pipeline;
    const stale =
      !summary || ((summary.conflicts as any[]) || []).some((c) => !c || !c.valuesHash);
    if (stale) {
      try {
        await evaluateBundleNow(organisationId, bundleId, 'read_refresh');
        bundle = (await Bundle.findOne({ bundleId, organisationId, deletedAt: null }).lean()) || bundle;
      } catch (err) {
        logger.warn('bundle: could not refresh summary', {
          bundleId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    const [documents, latestRun, snapshot, template] = await Promise.all([
      BundleDocument.find({
        bundleId,
        organisationId,
        removedAt: null,
      }).lean(),
      BundleRun.findOne({ bundleId, organisationId })
        .sort({ createdAt: -1 })
        .lean(),
      this.loadSnapshot(organisationId, bundle.templateId, bundle.templateVersion),
      BundleTemplate.findOne({
        templateId: bundle.templateId,
        $or: [{ organisationId }, { organisationId: null, isExample: true }],
      })
        .select('templateId name')
        .lean(),
    ]);

    const docRows = documents.length
      ? await Document.find({
          documentId: { $in: documents.map((d) => d.documentId) },
          organisationId,
        })
          .select(
            'documentId originalFilename displayTitle mimeType size status deletedAt uploadedBy sharedWithOrganisation'
          )
          .lean()
      : [];
    const docById = new Map(docRows.map((d: any) => [d.documentId, d]));

    const review: any = (bundle as any).review;
    let reviewer: { userId: string; name: string } | null = null;
    if (review?.reviewedBy) {
      const u = await User.findOne({ userId: review.reviewedBy }).select('userId name').lean();
      reviewer = { userId: review.reviewedBy, name: (u as any)?.name || 'A team member' };
    }

    return {
      ...this.toBundleResponse(bundle),
      templateName: (template as any)?.name ?? null,
      template: {
        templateId: bundle.templateId,
        version: bundle.templateVersion,
        name: (template as any)?.name ?? null,
        documentTypes: documentTypesForClient(snapshot?.documentTypes),
        profileFields: (snapshot?.profileFields || []).map((f: any) => ({
          key: f.key,
          label: f.label || f.key,
          type: f.type || 'string',
          options: Array.isArray(f.options) ? f.options : [],
          required: f.required === true,
        })),
      },
      pipeline: (bundle as any).pipeline ?? null,
      progress: progressOf((bundle as any).pipeline),
      review: review?.reviewedAt
        ? { reviewedAt: review.reviewedAt, note: review.note ?? null, reviewer }
        : null,
      documents: documents.map((d) => {
        const doc: any = docById.get(d.documentId);
        const visible =
          Boolean(doc) && (doc.sharedWithOrganisation !== false || doc.uploadedBy === userId);
        const c: any = d.classification;
        return {
          documentId: d.documentId,
          typeKey: d.assignedTypeKey,
          classificationConfidence: d.classificationConfidence,
          assignedBy: d.assignedBy,
          pageRange: d.pageRange,
          addedAt: d.addedAt,
          filename: visible ? doc.displayTitle || doc.originalFilename : null,
          mimeType: visible ? doc.mimeType : null,
          size: visible ? doc.size : null,
          extractionStatus: doc ? doc.status : null,
          available: Boolean(doc) && !doc.deletedAt,
          restricted: Boolean(doc) && !visible,
          classification: c
            ? {
                status: c.status,
                suggestedTypeKey: c.suggestedTypeKey ?? null,
                confidence: c.confidence ?? null,
                alternatives: Array.isArray(c.alternatives) ? c.alternatives : [],
                reasons: Array.isArray(c.reasons) ? c.reasons : [],
                lastError: c.lastError ?? null,
              }
            : null,
        };
      }),
      latestRun: latestRun
        ? {
            runId: latestRun.runId,
            status: latestRun.status,
            outcome: latestRun.outcome,
            startedAt: latestRun.startedAt,
            finishedAt: latestRun.finishedAt,
          }
        : null,
    };
  }

  public async listBundles(params: ListBundlesParams) {
    await assertOrgRole(params.userId, params.organisationId, 'member');

    const filter: Record<string, unknown> = {
      organisationId: params.organisationId,
      deletedAt: null,
    };

    if (params.projectId) {
      filter.projectId = params.projectId;
    }

    if (params.templateId) {
      filter.templateId = params.templateId;
    }

    if (params.status) {
      const statuses = params.status
        .split(',')
        .map((v) => v.trim())
        .filter(Boolean);
      filter.status = statuses.length > 1 ? { $in: statuses } : statuses[0];
    }

    const q = params.q?.trim();
    if (q) {
      const rx = new RegExp(escapeRegex(q.slice(0, 100)), 'i');
      filter.$or = [{ name: rx }, { externalRef: rx }];
    }

    if (params.externalRef) {
      filter.externalRef = params.externalRef;
    }

    if (params.assignee) {
      filter.assignees = params.assignee;
    }

    if (params.updatedSince) {
      filter.updatedAt = { $gte: new Date(params.updatedSince) };
    }

    const page = Math.max(params.page ?? 1, 1);
    const limit = Math.min(Math.max(params.limit ?? 20, 1), 100);
    const skip = (page - 1) * limit;

    const [bundles, total] = await Promise.all([
      Bundle.find(filter)
        .sort({ updatedAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Bundle.countDocuments(filter),
    ]);

    const bundleIds = bundles.map((b) => b.bundleId);
    const docCounts = await BundleDocument.aggregate([
      {
        $match: {
          bundleId: { $in: bundleIds },
          organisationId: params.organisationId,
          removedAt: null,
        },
      },
      { $group: { _id: '$bundleId', count: { $sum: 1 } } },
    ]);

    const countMap = new Map(docCounts.map((d) => [d._id, d.count]));

    const templateIds = Array.from(new Set(bundles.map((b) => b.templateId)));
    const templates = templateIds.length
      ? await BundleTemplate.find({
          templateId: { $in: templateIds },
          $or: [
            { organisationId: params.organisationId },
            { organisationId: null, isExample: true },
          ],
        })
          .select('templateId name')
          .lean()
      : [];
    const templateNames = new Map(templates.map((t: any) => [t.templateId, t.name]));

    return {
      bundles: bundles.map((b) => ({
        ...this.toBundleListItem(b),
        documentCount: countMap.get(b.bundleId) || 0,
        templateName: templateNames.get(b.templateId) ?? null,
        progress: progressOf((b as any).pipeline),
        reviewed: Boolean((b as any).review?.reviewedAt),
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 0,
      },
    };
  }

  public async updateBundle(params: UpdateBundleParams) {
    await assertOrgRole(params.userId, params.organisationId, 'member');

    const bundle = await Bundle.findOne({
      bundleId: params.bundleId,
      organisationId: params.organisationId,
      deletedAt: null,
    });

    if (!bundle) {
      throw new NotFoundError('Bundle', params.bundleId);
    }

    if (bundle.readOnly) {
      throw new ValidationError('Bundle is read-only');
    }

    const before = {
      name: bundle.name,
      status: bundle.status,
      assignees: bundle.assignees,
    };

    if (params.name !== undefined) {
      bundle.name = params.name;
    }

    if (params.profile !== undefined) {
      bundle.profile = params.profile;
    }

    if (params.instructionsOverride !== undefined) {
      bundle.instructionsOverride = params.instructionsOverride;
    }

    if (params.assignees !== undefined) {
      bundle.assignees = params.assignees;
    }

    if (params.tags !== undefined) {
      bundle.tags = params.tags;
    }

    if (params.dueAt !== undefined) {
      bundle.dueAt = params.dueAt ? new Date(params.dueAt) : null;
    }

    await bundle.save();

    await auditService.logEvent({
      actorId: params.userId,
      organisationId: params.organisationId,
      action: 'bundle.update',
      resourceType: 'bundle',
      resourceId: params.bundleId,
      metadata: { before, after: { name: bundle.name, assignees: bundle.assignees } },
    });

    return this.toBundleResponse(bundle);
  }

  public async deleteBundle(
    userId: string,
    organisationId: string,
    bundleId: string,
    mode: 'cascade' | 'detach' = 'detach'
  ) {
    await assertOrgRole(userId, organisationId, 'admin');

    const bundle = await Bundle.findOne({
      bundleId,
      organisationId,
      deletedAt: null,
    });

    if (!bundle) {
      throw new NotFoundError('Bundle', bundleId);
    }

    bundle.deletedAt = new Date();
    bundle.status = 'archived';
    await bundle.save();

    await BundleDocument.updateMany(
      { bundleId, organisationId },
      { $set: { removedAt: new Date() } }
    );

    await auditService.logEvent({
      actorId: userId,
      organisationId,
      action: 'bundle.delete',
      resourceType: 'bundle',
      resourceId: bundleId,
      metadata: { mode, externalRef: bundle.externalRef },
    });

    return { deleted: true, bundleId, mode };
  }

  public async attachDocuments(params: AttachDocumentsParams) {
    await assertOrgRole(params.userId, params.organisationId, 'member');

    const bundle = await Bundle.findOne({
      bundleId: params.bundleId,
      organisationId: params.organisationId,
      deletedAt: null,
    }).lean();

    if (!bundle) {
      throw new NotFoundError('Bundle', params.bundleId);
    }

    if (bundle.readOnly) {
      throw new ValidationError('Bundle is read-only');
    }

    const documents = await Document.find({
      documentId: { $in: params.documentIds },
      organisationId: params.organisationId,
      deletedAt: null,
      ...visibilityFilter(params.userId, 'uploadedBy'),
    }).lean();

    const foundIds = new Set(documents.map((d) => d.documentId));
    const missingIds = params.documentIds.filter((id) => !foundIds.has(id));

    if (missingIds.length > 0) {
      throw new NotFoundError('Documents', missingIds.join(', '));
    }

    const existingLinks = await BundleDocument.find({
      bundleId: params.bundleId,
      organisationId: params.organisationId,
      documentId: { $in: params.documentIds },
      removedAt: null,
    }).lean();

    const existingDocIds = new Set(existingLinks.map((l) => l.documentId));
    const newDocIds = params.documentIds.filter((id) => !existingDocIds.has(id));

    // Upsert so a document removed earlier can be attached again (the link row
    // is kept with removedAt set, and (bundleId, documentId) is unique).
    const operations = newDocIds.map((documentId) => ({
      updateOne: {
        filter: {
          bundleId: params.bundleId,
          organisationId: params.organisationId,
          documentId,
        },
        update: {
          $set: {
            assignedTypeKey: params.typeKey || null,
            classificationConfidence: null,
            assignedBy: params.typeKey ? 'user' : 'auto',
            pageRange: null,
            addedBy: params.userId,
            addedAt: new Date(),
            removedAt: null,
          },
          $unset: { classification: '', keyFields: '' },
        },
        upsert: true,
      },
    }));

    if (operations.length > 0) {
      await BundleDocument.bulkWrite(operations as any);
    }

    for (const documentId of newDocIds) {
      await auditService.logEvent({
        actorId: params.userId,
        organisationId: params.organisationId,
        action: 'bundle.document_add',
        resourceType: 'bundle',
        resourceId: params.bundleId,
        metadata: { documentId, typeKey: params.typeKey },
      });
    }

    if (newDocIds.length > 0) {
      await this.clearReview(params.organisationId, params.bundleId, params.userId, 'documents_added');
    }
    await notifyDocumentsAdded(params.organisationId, params.bundleId, newDocIds);

    return {
      bundleId: params.bundleId,
      added: newDocIds.length,
      skipped: existingDocIds.size,
    };
  }

  public async removeDocument(
    userId: string,
    organisationId: string,
    bundleId: string,
    documentId: string
  ) {
    await assertOrgRole(userId, organisationId, 'member');

    const bundle = await Bundle.findOne({
      bundleId,
      organisationId,
      deletedAt: null,
    }).lean();

    if (!bundle) {
      throw new NotFoundError('Bundle', bundleId);
    }

    if (bundle.readOnly) {
      throw new ValidationError('Bundle is read-only');
    }

    const link = await BundleDocument.findOne({
      bundleId,
      documentId,
      organisationId,
      removedAt: null,
    });

    if (!link) {
      throw new NotFoundError('Bundle document', documentId);
    }

    link.removedAt = new Date();
    await link.save();

    await auditService.logEvent({
      actorId: userId,
      organisationId,
      action: 'bundle.document_remove',
      resourceType: 'bundle',
      resourceId: bundleId,
      metadata: { documentId },
    });

    await this.clearReview(organisationId, bundleId, userId, 'document_removed');
    await notifyBundleChanged(organisationId, bundleId, 'document_removed');

    return { removed: true, bundleId, documentId };
  }

  public async updateBundleDocument(params: UpdateBundleDocumentParams) {
    await assertOrgRole(params.userId, params.organisationId, 'member');

    const bundle = await Bundle.findOne({
      bundleId: params.bundleId,
      organisationId: params.organisationId,
      deletedAt: null,
    }).lean();

    if (!bundle) {
      throw new NotFoundError('Bundle', params.bundleId);
    }

    if (bundle.readOnly) {
      throw new ValidationError('Bundle is read-only');
    }

    const link = await BundleDocument.findOne({
      bundleId: params.bundleId,
      documentId: params.documentId,
      organisationId: params.organisationId,
      removedAt: null,
    });

    if (!link) {
      throw new NotFoundError('Bundle document', params.documentId);
    }

    const snapshot = await this.loadSnapshot(
      params.organisationId,
      bundle.templateId,
      bundle.templateVersion
    );
    const slotKeys = new Set(
      ((snapshot?.documentTypes as any[]) || []).map((d) => d?.key).filter(Boolean)
    );
    if (snapshot && !slotKeys.has(params.typeKey)) {
      throw new ValidationError(`Unknown slot for this bundle: ${params.typeKey}`);
    }

    const before = link.assignedTypeKey;
    link.assignedTypeKey = params.typeKey;
    link.assignedBy = 'user';
    // A person picking the slot settles a low-confidence or failed classification.
    const cls: any = link.classification;
    if (cls && (cls.status === 'needs_review' || cls.status === 'failed')) {
      cls.status = 'classified';
      link.markModified('classification');
    }
    await link.save();

    await auditService.logEvent({
      actorId: params.userId,
      organisationId: params.organisationId,
      action: 'bundle.document_reassign',
      resourceType: 'bundle',
      resourceId: params.bundleId,
      metadata: {
        documentId: params.documentId,
        before,
        after: params.typeKey,
      },
    });

    if (before !== params.typeKey) {
      await this.clearReview(params.organisationId, params.bundleId, params.userId, 'document_reassigned');
    }
    await notifyBundleChanged(params.organisationId, params.bundleId, 'document_reassigned');

    return {
      bundleId: params.bundleId,
      documentId: params.documentId,
      typeKey: params.typeKey,
    };
  }

  public async uploadDocument(
    userId: string,
    organisationId: string,
    bundleId: string,
    file: {
      buffer: Buffer;
      filename: string;
      mimetype: string;
    },
    typeKey?: string
  ) {
    await assertOrgRole(userId, organisationId, 'member');

    const bundle = await Bundle.findOne({
      bundleId,
      organisationId,
      deletedAt: null,
    }).lean();

    if (!bundle) {
      throw new NotFoundError('Bundle', bundleId);
    }

    if (bundle.readOnly) {
      throw new ValidationError('Bundle is read-only');
    }

    const result = await documentService.uploadDocument({
      userId,
      organisationId,
      projectId: bundle.projectId,
      originalFilename: file.filename,
      mimeType: file.mimetype,
      buffer: file.buffer,
      sharedWithOrganisation: true,
    });

    await BundleDocument.create({
      bundleId,
      organisationId,
      documentId: result.documentId,
      assignedTypeKey: typeKey || null,
      classificationConfidence: null,
      assignedBy: typeKey ? 'user' : 'auto',
      pageRange: null,
      addedBy: userId,
      addedAt: new Date(),
    });

    await auditService.logEvent({
      actorId: userId,
      organisationId,
      action: 'bundle.document_add',
      resourceType: 'bundle',
      resourceId: bundleId,
      metadata: {
        documentId: result.documentId,
        typeKey,
        filename: file.filename,
        uploaded: true,
      },
    });

    await this.clearReview(organisationId, bundleId, userId, 'document_uploaded');
    await notifyDocumentsAdded(organisationId, bundleId, [result.documentId]);

    return {
      bundleId,
      documentId: result.documentId,
      jobId: result.jobId,
      typeKey,
    };
  }

  public async createRun(params: CreateBundleRunParams) {
    await assertOrgRole(params.userId, params.organisationId, 'member');

    const bundle = await Bundle.findOne({
      bundleId: params.bundleId,
      organisationId: params.organisationId,
      deletedAt: null,
    });

    if (!bundle) {
      throw new NotFoundError('Bundle', params.bundleId);
    }

    const templateVersion =
      params.templateVersion === 'latest'
        ? (
            await BundleTemplate.findOne({
              templateId: bundle.templateId,
            }).lean()
          )?.latestVersion || bundle.templateVersion
        : bundle.templateVersion;

    const runId = uuidv4();

    const run = await BundleRun.create({
      runId,
      bundleId: params.bundleId,
      organisationId: params.organisationId,
      templateVersion,
      trigger: params.trigger || 'api',
      status: 'queued',
      stepResults: [],
      checklist: [],
      exceptions: [],
      record: {},
      startedAt: new Date(),
    });

    bundle.lastRunId = runId;
    bundle.runCount += 1;
    bundle.status = 'running';
    await bundle.save();

    await auditService.logEvent({
      actorId: params.userId,
      organisationId: params.organisationId,
      action: 'bundle.run',
      resourceType: 'bundle',
      resourceId: params.bundleId,
      metadata: {
        runId,
        templateVersion,
        trigger: params.trigger || 'api',
      },
    });

    return {
      runId,
      bundleId: params.bundleId,
      templateVersion,
      status: run.status,
    };
  }

  public async getRun(
    userId: string,
    organisationId: string,
    bundleId: string,
    runId: string
  ) {
    await assertOrgRole(userId, organisationId, 'member');

    const run = await BundleRun.findOne({
      runId,
      bundleId,
      organisationId,
    }).lean();

    if (!run) {
      throw new NotFoundError('Run', runId);
    }

    return {
      runId: run.runId,
      bundleId: run.bundleId,
      templateVersion: run.templateVersion,
      trigger: run.trigger,
      status: run.status,
      outcome: run.outcome,
      checklist: run.checklist,
      exceptions: run.exceptions,
      record: run.record,
      summary: run.summary,
      startedAt: run.startedAt,
      finishedAt: run.finishedAt,
      durationMs: run.durationMs,
    };
  }

  public async listRuns(
    userId: string,
    organisationId: string,
    bundleId: string
  ) {
    await assertOrgRole(userId, organisationId, 'member');

    const bundle = await Bundle.findOne({
      bundleId,
      organisationId,
      deletedAt: null,
    }).lean();

    if (!bundle) {
      throw new NotFoundError('Bundle', bundleId);
    }

    const runs = await BundleRun.find({ bundleId, organisationId })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();

    return runs.map((r) => ({
      runId: r.runId,
      templateVersion: r.templateVersion,
      trigger: r.trigger,
      status: r.status,
      outcome: r.outcome,
      exceptionCount: r.exceptions?.length || 0,
      startedAt: r.startedAt,
      finishedAt: r.finishedAt,
      durationMs: r.durationMs,
    }));
  }

  /** Resolve (pick the correct value), dismiss (with a reason) or reopen a conflict. */
  public async actOnConflict(params: ConflictActionParams) {
    await assertOrgRole(
      params.userId,
      params.organisationId,
      params.action === 'dismiss' ? 'admin' : 'member'
    );

    const bundle = await Bundle.findOne({
      bundleId: params.bundleId,
      organisationId: params.organisationId,
      deletedAt: null,
    }).lean();
    if (!bundle) {
      throw new NotFoundError('Bundle', params.bundleId);
    }
    if (bundle.readOnly) {
      throw new ValidationError('Bundle is read-only');
    }

    const findConflict = (b: any) =>
      ((b?.pipeline?.conflicts as any[]) || []).find(
        (c) => c && c.field === params.field && c.valuesHash === params.valuesHash
      );

    let conflict = findConflict(bundle);
    if (!conflict) {
      await evaluateBundleNow(params.organisationId, params.bundleId, 'conflict_lookup');
      const fresh = await Bundle.findOne({
        bundleId: params.bundleId,
        organisationId: params.organisationId,
        deletedAt: null,
      }).lean();
      conflict = findConflict(fresh);
    }
    if (!conflict) {
      throw new ConflictError('This conflict has changed. Refresh the bundle and try again.');
    }

    const key = conflictKey(params.field);
    const reason = params.reason?.trim() || null;
    let resolvedValue: string | null = null;

    if (params.action === 'resolve') {
      const wanted = params.value?.trim();
      const match = (conflict.values as any[]).find(
        (v) => String(v.value).trim().toLowerCase() === (wanted || '').toLowerCase()
      );
      if (!wanted || !match) {
        throw new ValidationError('Pick one of the conflicting values as the correct one');
      }
      resolvedValue = String(match.value);
    }
    if (params.action === 'dismiss' && (!reason || reason.length < 3)) {
      throw new ValidationError('A reason is required to dismiss a conflict');
    }

    // Only one live decision per conflict and values.
    await BundleExceptionAction.updateMany(
      {
        organisationId: params.organisationId,
        bundleId: params.bundleId,
        runId: PIPELINE_RUN_ID,
        exceptionKey: key,
        valuesHash: params.valuesHash,
        status: 'active',
      },
      { $set: { status: 'lapsed' } }
    );

    if (params.action !== 'reopen') {
      const actionId = uuidv4();
      await BundleExceptionAction.create({
        actionId,
        organisationId: params.organisationId,
        bundleId: params.bundleId,
        runId: PIPELINE_RUN_ID,
        exceptionKey: key,
        valuesHash: params.valuesHash,
        type: params.action === 'dismiss' ? 'override' : 'resolve',
        reason,
        resolvedValue,
        actorId: params.userId,
        status: 'active',
      });
      await recordBundleEvent(`conflict:${actionId}`, {
        type: params.action === 'dismiss' ? 'bundle.conflict_dismissed' : 'bundle.conflict_resolved',
        organisationId: params.organisationId,
        bundleId: params.bundleId,
        actorId: params.userId,
        data: { field: params.field, value: resolvedValue ?? undefined, reason: reason ?? undefined },
      });
    } else {
      await auditService.logEvent({
        actorId: params.userId,
        organisationId: params.organisationId,
        action: 'bundle.conflict_reopened',
        resourceType: 'bundle',
        resourceId: params.bundleId,
        metadata: { field: params.field },
      });
      await this.clearReview(params.organisationId, params.bundleId, params.userId, 'conflict_reopened');
    }

    await evaluateBundleNow(params.organisationId, params.bundleId, `conflict_${params.action}`);
    return this.getBundle(params.userId, params.organisationId, params.bundleId);
  }

  /**
   * Marks the bundle reviewed. Allowed only when nothing is open: every
   * required slot filled, no documents waiting for a slot and no open
   * conflicts. The bundle moves to `ready`; this is a review record, not a
   * decision on the customer or case.
   */
  public async markReviewed(params: MarkReviewedParams) {
    await assertOrgRole(params.userId, params.organisationId, 'member');

    const bundle = await Bundle.findOne({
      bundleId: params.bundleId,
      organisationId: params.organisationId,
      deletedAt: null,
    }).lean();
    if (!bundle) {
      throw new NotFoundError('Bundle', params.bundleId);
    }
    if (bundle.readOnly) {
      throw new ValidationError('Bundle is read-only');
    }
    if (bundle.status === 'ready' && (bundle as any).review?.reviewedAt) {
      return this.getBundle(params.userId, params.organisationId, params.bundleId);
    }

    await evaluateBundleNow(params.organisationId, params.bundleId, 'review_check');
    const fresh: any = await Bundle.findOne({
      bundleId: params.bundleId,
      organisationId: params.organisationId,
      deletedAt: null,
    }).lean();
    if (!fresh) {
      throw new NotFoundError('Bundle', params.bundleId);
    }

    if (fresh.status !== REVIEWABLE_STATUS) {
      const p = progressOf(fresh.pipeline);
      const parts: string[] = [];
      if (p?.inProgress) parts.push(`${p.inProgress} document(s) still being sorted`);
      if (p?.missing) parts.push(`${p.missing} required item(s) missing`);
      if (p?.openConflicts) parts.push(`${p.openConflicts} open conflict(s)`);
      const docs = fresh.pipeline?.documents || {};
      const waiting = Math.max(docs.unassigned || 0, (docs.needsReview || 0) + (docs.failed || 0));
      if (waiting) parts.push(`${waiting} document(s) need a slot`);
      const detail = parts.length ? `: ${parts.join(', ')}` : '';
      throw new ConflictError(
        parts.length
          ? `This bundle still has open items${detail}.`
          : `This bundle cannot be marked reviewed while its status is ${fresh.status}.`,
        { status: fresh.status, progress: p }
      );
    }

    const reviewedAt = new Date();
    const note = params.note?.trim() || null;
    const moved = await Bundle.findOneAndUpdate(
      {
        bundleId: params.bundleId,
        organisationId: params.organisationId,
        deletedAt: null,
        status: REVIEWABLE_STATUS,
      },
      { $set: { status: 'ready', review: { reviewedBy: params.userId, reviewedAt, note } } },
      { new: true }
    ).lean();
    if (!moved) {
      throw new ConflictError('The bundle changed while you were reviewing it. Refresh and try again.');
    }

    await recordBundleEvent(`reviewed:${params.bundleId}:${uuidv4()}`, {
      type: 'bundle.reviewed',
      organisationId: params.organisationId,
      bundleId: params.bundleId,
      from: REVIEWABLE_STATUS,
      to: 'ready',
      actorId: params.userId,
      data: { note: note ?? undefined },
    });

    return this.getBundle(params.userId, params.organisationId, params.bundleId);
  }

  /** Bundle timeline: pipeline events and people's actions, newest first. */
  public async getTimeline(
    userId: string,
    organisationId: string,
    bundleId: string,
    limit = 100
  ) {
    await assertOrgRole(userId, organisationId, 'member');

    const bundle = await Bundle.findOne({ bundleId, organisationId, deletedAt: null })
      .select('bundleId')
      .lean();
    if (!bundle) {
      throw new NotFoundError('Bundle', bundleId);
    }

    const events = await AuditEvent.find({
      organisationId,
      resourceType: 'bundle',
      resourceId: bundleId,
    })
      .sort({ timestamp: -1 })
      .limit(Math.min(Math.max(limit, 1), 200))
      .lean();

    const isSystem = (id: string | undefined) => !id || id === 'system' || id.startsWith('system:');
    const actorIds = Array.from(new Set(events.map((e) => e.actorId).filter((id) => !isSystem(id))));
    const users = actorIds.length
      ? await User.find({ userId: { $in: actorIds } }).select('userId name').lean()
      : [];
    const names = new Map(users.map((u: any) => [u.userId, u.name]));

    const pick = (m: any) => {
      if (!m || typeof m !== 'object') return {};
      const out: Record<string, unknown> = {};
      for (const k of [
        'documentId',
        'typeKey',
        'suggestedTypeKey',
        'confidence',
        'status',
        'from',
        'to',
        'before',
        'after',
        'field',
        'fields',
        'value',
        'reason',
        'note',
        'filename',
        'missing',
        'conflicts',
        'runId',
      ]) {
        if (m[k] !== undefined && m[k] !== null) out[k] = m[k];
      }
      return out;
    };

    return events.map((e: any) => ({
      id: String(e._id),
      action: e.action,
      timestamp: e.timestamp,
      actor: isSystem(e.actorId)
        ? { userId: null, name: 'DoqSeal', isSystem: true }
        : { userId: e.actorId, name: names.get(e.actorId) || 'A team member', isSystem: false },
      details: pick(e.metadata),
    }));
  }

  private toBundleResponse(bundle: IBundle | any) {
    return {
      bundleId: bundle.bundleId,
      organisationId: bundle.organisationId,
      projectId: bundle.projectId,
      templateId: bundle.templateId,
      templateVersion: bundle.templateVersion,
      externalRef: bundle.externalRef,
      name: bundle.name,
      profile: bundle.profile,
      instructionsOverride: bundle.instructionsOverride,
      status: bundle.status,
      lastRunId: bundle.lastRunId,
      runCount: bundle.runCount,
      source: bundle.source,
      requestLinkId: bundle.requestLinkId,
      assignees: bundle.assignees,
      tags: bundle.tags,
      dueAt: bundle.dueAt,
      readOnly: bundle.readOnly,
      reviewed: Boolean(bundle.review?.reviewedAt),
      createdBy: bundle.createdBy,
      createdAt: bundle.createdAt,
      updatedAt: bundle.updatedAt,
    };
  }

  private toBundleListItem(bundle: IBundle | any) {
    return {
      bundleId: bundle.bundleId,
      projectId: bundle.projectId,
      templateId: bundle.templateId,
      templateVersion: bundle.templateVersion,
      externalRef: bundle.externalRef,
      name: bundle.name,
      status: bundle.status,
      runCount: bundle.runCount,
      assignees: bundle.assignees,
      createdAt: bundle.createdAt,
      updatedAt: bundle.updatedAt,
    };
  }
}

export default new BundleService();
