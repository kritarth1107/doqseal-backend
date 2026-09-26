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
import { notifyDocumentsAdded, notifyBundleChanged } from './bundle/pipeline/runtime';
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

export class BundleService {
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

    const bundle = await Bundle.findOne({
      bundleId,
      organisationId,
      deletedAt: null,
    }).lean();

    if (!bundle) {
      throw new NotFoundError('Bundle', bundleId);
    }

    const [documents, latestRun] = await Promise.all([
      BundleDocument.find({
        bundleId,
        organisationId,
        removedAt: null,
      }).lean(),
      BundleRun.findOne({ bundleId, organisationId })
        .sort({ createdAt: -1 })
        .lean(),
    ]);

    return {
      ...this.toBundleResponse(bundle),
      documents: documents.map((d) => ({
        documentId: d.documentId,
        typeKey: d.assignedTypeKey,
        classificationConfidence: d.classificationConfidence,
        assignedBy: d.assignedBy,
        pageRange: d.pageRange,
        addedAt: d.addedAt,
      })),
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
      filter.status = params.status;
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

    return {
      bundles: bundles.map((b) => ({
        ...this.toBundleListItem(b),
        documentCount: countMap.get(b.bundleId) || 0,
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

    const before = link.assignedTypeKey;
    link.assignedTypeKey = params.typeKey;
    link.assignedBy = 'user';
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
