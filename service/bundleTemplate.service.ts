import { v4 as uuidv4 } from 'uuid';
import BundleTemplate, { IBundleTemplate, IDraft } from '../model/bundleTemplate.model';
import BundleTemplateVersion from '../model/bundleTemplateVersion.model';
import { assertOrgRole, OrgRole } from '../utils/org-access.util';
import { visibilityFilter } from '../utils/visibility.util';
import auditService from './audit.service';
import {
  BUNDLE_STARTER_TEMPLATES,
  BUNDLE_STARTER_VERTICAL_LABELS,
} from '../constants/bundleStarterTemplates';
import {
  NotFoundError,
  ForbiddenError,
  ValidationError,
  ConflictError,
} from '../utils/errors.util';

export interface CreateTemplateParams {
  userId: string;
  organisationId: string;
  name: string;
  description?: string;
  projectId?: string | null;
  draft?: Partial<IDraft>;
}

export interface UpdateTemplateParams {
  userId: string;
  organisationId: string;
  templateId: string;
  name?: string;
  description?: string;
  draft?: Partial<IDraft>;
  status?: 'draft' | 'archived';
}

export interface ListTemplatesParams {
  userId: string;
  organisationId: string;
  projectId?: string | null;
  status?: string;
  includeExamples?: boolean;
  page?: number;
  limit?: number;
}

export interface PublishTemplateParams {
  userId: string;
  organisationId: string;
  templateId: string;
  changelog?: string;
}

export interface CloneTemplateParams {
  userId: string;
  organisationId: string;
  sourceTemplateId: string;
  name: string;
  projectId?: string | null;
}

export interface CreateFromStarterParams {
  userId: string;
  organisationId: string;
  starterKey: string;
  name?: string | null;
  projectId?: string | null;
}

export class BundleTemplateService {
  /** Built-in starter templates, one or more per vertical. */
  public async listStarters(userId: string, organisationId: string) {
    await assertOrgRole(userId, organisationId, 'member');

    const existing = await BundleTemplate.find({
      organisationId,
      starterKey: { $in: BUNDLE_STARTER_TEMPLATES.map((t) => t.key) },
      deletedAt: null,
    })
      .select('templateId starterKey latestVersion status')
      .lean();
    const byKey = new Map(existing.map((t: any) => [t.starterKey, t]));

    return BUNDLE_STARTER_TEMPLATES.map((t) => {
      const copy: any = byKey.get(t.key);
      return {
        key: t.key,
        vertical: t.vertical,
        verticalLabel: BUNDLE_STARTER_VERTICAL_LABELS[t.vertical],
        name: t.name,
        description: t.description,
        documentTypes: t.documentTypes.map((d: any) => ({
          key: d.key,
          label: d.label,
          required: d.required === true,
          conditional: typeof d.required === 'string',
          minCount: d.minCount ?? 1,
        })),
        profileFieldCount: t.profileFields.length,
        ruleCount: t.rules.length,
        templateId: copy?.templateId ?? null,
        templateStatus: copy?.status ?? null,
      };
    });
  }

  /**
   * Copies a starter into the organisation and publishes version 1 so bundles
   * can be created from it straight away. Returns the existing copy if the
   * organisation already has one for this starter.
   */
  public async createFromStarter(params: CreateFromStarterParams) {
    await assertOrgRole(params.userId, params.organisationId, 'member');

    const starter = BUNDLE_STARTER_TEMPLATES.find((t) => t.key === params.starterKey);
    if (!starter) {
      throw new NotFoundError('Starter template', params.starterKey);
    }

    const existing = await BundleTemplate.findOne({
      organisationId: params.organisationId,
      starterKey: starter.key,
      deletedAt: null,
      latestVersion: { $gt: 0 },
    }).lean();
    if (existing) {
      return { ...this.toTemplateResponse(existing), created: false };
    }

    const templateId = uuidv4();
    const draft: IDraft = {
      instructions: '',
      documentTypes: starter.documentTypes,
      profileFields: starter.profileFields,
      rules: starter.rules.map((r: any) => ({ ...r, origin: 'manual' })),
      outputSchema: starter.outputSchema,
      automation: undefined,
      fieldMapping: {},
    } as IDraft;

    this.validateRules(draft.rules || []);

    const template = await BundleTemplate.create({
      templateId,
      organisationId: params.organisationId,
      projectId: params.projectId || null,
      name: params.name?.trim() || starter.name,
      description: starter.description,
      status: 'published',
      latestVersion: 1,
      draft,
      isExample: false,
      starterKey: starter.key,
      createdBy: params.userId,
    });

    await BundleTemplateVersion.create({
      templateId,
      organisationId: params.organisationId,
      version: 1,
      snapshot: draft,
      compiledFrom: null,
      publishedBy: params.userId,
      publishedAt: new Date(),
    });

    await auditService.logEvent({
      actorId: params.userId,
      organisationId: params.organisationId,
      action: 'template.create_from_starter',
      resourceType: 'bundle_template',
      resourceId: templateId,
      metadata: { starterKey: starter.key, version: 1 },
    });

    return { ...this.toTemplateResponse(template), created: true };
  }

  public async createTemplate(params: CreateTemplateParams) {
    await assertOrgRole(params.userId, params.organisationId, 'member');

    const templateId = uuidv4();

    const draft: IDraft = {
      instructions: params.draft?.instructions || '',
      documentTypes: params.draft?.documentTypes || [],
      profileFields: params.draft?.profileFields || [],
      rules: params.draft?.rules || [],
      outputSchema: params.draft?.outputSchema || [],
      automation: params.draft?.automation ?? undefined,
      fieldMapping: params.draft?.fieldMapping || {},
    };

    const template = await BundleTemplate.create({
      templateId,
      organisationId: params.organisationId,
      projectId: params.projectId || null,
      name: params.name,
      description: params.description || '',
      status: 'draft',
      latestVersion: 0,
      draft,
      isExample: false,
      createdBy: params.userId,
    });

    await auditService.logEvent({
      actorId: params.userId,
      organisationId: params.organisationId,
      action: 'template.create',
      resourceType: 'bundle_template',
      resourceId: templateId,
      metadata: {
        name: params.name,
        projectId: params.projectId,
      },
    });

    return this.toTemplateResponse(template);
  }

  public async getTemplate(
    userId: string,
    organisationId: string,
    templateId: string
  ) {
    await assertOrgRole(userId, organisationId, 'member');

    const template = await BundleTemplate.findOne({
      templateId,
      deletedAt: null,
      $or: [
        { organisationId },
        { organisationId: null, isExample: true },
      ],
    }).lean();

    if (!template) {
      throw new NotFoundError('Template', templateId);
    }

    return this.toTemplateResponse(template);
  }

  public async listTemplates(params: ListTemplatesParams) {
    await assertOrgRole(params.userId, params.organisationId, 'member');

    const filter: Record<string, unknown> = {
      deletedAt: null,
    };

    if (params.includeExamples) {
      filter.$or = [
        { organisationId: params.organisationId },
        { organisationId: null, isExample: true },
      ];
    } else {
      filter.organisationId = params.organisationId;
    }

    if (params.projectId) {
      filter.projectId = params.projectId;
    }

    if (params.status) {
      filter.status = params.status;
    }

    const page = Math.max(params.page ?? 1, 1);
    const limit = Math.min(Math.max(params.limit ?? 20, 1), 100);
    const skip = (page - 1) * limit;

    const [templates, total] = await Promise.all([
      BundleTemplate.find(filter)
        .sort({ updatedAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      BundleTemplate.countDocuments(filter),
    ]);

    return {
      templates: templates.map((t) => this.toTemplateListItem(t)),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 0,
      },
    };
  }

  public async updateTemplate(params: UpdateTemplateParams) {
    await assertOrgRole(params.userId, params.organisationId, 'member');

    const template = await BundleTemplate.findOne({
      templateId: params.templateId,
      organisationId: params.organisationId,
      deletedAt: null,
    });

    if (!template) {
      throw new NotFoundError('Template', params.templateId);
    }

    if (template.status === 'archived' && params.status !== 'draft') {
      throw new ValidationError('Cannot modify archived template');
    }

    const before = {
      name: template.name,
      description: template.description,
      status: template.status,
    };

    if (params.name !== undefined) {
      template.name = params.name;
    }

    if (params.description !== undefined) {
      template.description = params.description;
    }

    if (params.draft) {
      template.draft = {
        ...template.draft,
        ...params.draft,
      } as IDraft;
    }

    if (params.status !== undefined) {
      template.status = params.status;
    }

    await template.save();

    await auditService.logEvent({
      actorId: params.userId,
      organisationId: params.organisationId,
      action: 'template.update',
      resourceType: 'bundle_template',
      resourceId: params.templateId,
      metadata: {
        before,
        after: {
          name: template.name,
          description: template.description,
          status: template.status,
        },
      },
    });

    return this.toTemplateResponse(template);
  }

  public async deleteTemplate(
    userId: string,
    organisationId: string,
    templateId: string
  ) {
    await assertOrgRole(userId, organisationId, 'admin');

    const template = await BundleTemplate.findOne({
      templateId,
      organisationId,
      deletedAt: null,
    });

    if (!template) {
      throw new NotFoundError('Template', templateId);
    }

    template.deletedAt = new Date();
    await template.save();

    await auditService.logEvent({
      actorId: userId,
      organisationId,
      action: 'template.delete',
      resourceType: 'bundle_template',
      resourceId: templateId,
      metadata: { name: template.name },
    });

    return { deleted: true, templateId };
  }

  public async publishTemplate(params: PublishTemplateParams) {
    await assertOrgRole(params.userId, params.organisationId, 'member');

    const template = await BundleTemplate.findOne({
      templateId: params.templateId,
      organisationId: params.organisationId,
      deletedAt: null,
    });

    if (!template) {
      throw new NotFoundError('Template', params.templateId);
    }

    if (!template.draft.documentTypes || template.draft.documentTypes.length === 0) {
      throw new ValidationError('Cannot publish template without document types');
    }

    this.validateRules(template.draft.rules || []);

    const newVersion = template.latestVersion + 1;

    await BundleTemplateVersion.create({
      templateId: params.templateId,
      organisationId: params.organisationId,
      version: newVersion,
      snapshot: {
        instructions: template.draft.instructions,
        documentTypes: template.draft.documentTypes,
        profileFields: template.draft.profileFields,
        rules: template.draft.rules,
        outputSchema: template.draft.outputSchema,
        automation: template.draft.automation,
        fieldMapping: template.draft.fieldMapping,
      },
      compiledFrom: template.draft.instructions
        ? {
            instructions: template.draft.instructions,
            unresolved: [],
          }
        : null,
      publishedBy: params.userId,
      publishedAt: new Date(),
    });

    template.latestVersion = newVersion;
    template.status = 'published';
    await template.save();

    await auditService.logEvent({
      actorId: params.userId,
      organisationId: params.organisationId,
      action: 'template.publish',
      resourceType: 'bundle_template',
      resourceId: params.templateId,
      metadata: {
        version: newVersion,
        changelog: params.changelog,
      },
    });

    return {
      templateId: params.templateId,
      version: newVersion,
      publishedAt: new Date().toISOString(),
    };
  }

  public async listVersions(
    userId: string,
    organisationId: string,
    templateId: string
  ) {
    await assertOrgRole(userId, organisationId, 'member');

    const template = await BundleTemplate.findOne({
      templateId,
      deletedAt: null,
      $or: [
        { organisationId },
        { organisationId: null, isExample: true },
      ],
    }).lean();

    if (!template) {
      throw new NotFoundError('Template', templateId);
    }

    const versions = await BundleTemplateVersion.find({ templateId })
      .sort({ version: -1 })
      .lean();

    return versions.map((v) => ({
      version: v.version,
      publishedBy: v.publishedBy,
      publishedAt: v.publishedAt,
      documentTypeCount: v.snapshot.documentTypes?.length || 0,
      ruleCount: v.snapshot.rules?.length || 0,
    }));
  }

  public async getVersion(
    userId: string,
    organisationId: string,
    templateId: string,
    version: number
  ) {
    await assertOrgRole(userId, organisationId, 'member');

    const templateVersion = await BundleTemplateVersion.findOne({
      templateId,
      version,
      $or: [
        { organisationId },
        { organisationId: null },
      ],
    }).lean();

    if (!templateVersion) {
      throw new NotFoundError('Template version', `${templateId}@${version}`);
    }

    return {
      templateId: templateVersion.templateId,
      version: templateVersion.version,
      snapshot: templateVersion.snapshot,
      compiledFrom: templateVersion.compiledFrom,
      publishedBy: templateVersion.publishedBy,
      publishedAt: templateVersion.publishedAt,
    };
  }

  public async cloneTemplate(params: CloneTemplateParams) {
    await assertOrgRole(params.userId, params.organisationId, 'member');

    const source = await BundleTemplate.findOne({
      templateId: params.sourceTemplateId,
      deletedAt: null,
      $or: [
        { organisationId: params.organisationId },
        { organisationId: null, isExample: true },
      ],
    }).lean();

    if (!source) {
      throw new NotFoundError('Template', params.sourceTemplateId);
    }

    const templateId = uuidv4();

    let draft: IDraft;
    if (source.latestVersion > 0) {
      const latestVersion = await BundleTemplateVersion.findOne({
        templateId: params.sourceTemplateId,
        version: source.latestVersion,
      }).lean();

      draft = latestVersion?.snapshot || source.draft;
    } else {
      draft = source.draft;
    }

    const template = await BundleTemplate.create({
      templateId,
      organisationId: params.organisationId,
      projectId: params.projectId || null,
      name: params.name,
      description: source.description,
      status: 'draft',
      latestVersion: 0,
      draft,
      isExample: false,
      clonedFrom: params.sourceTemplateId,
      createdBy: params.userId,
    });

    await auditService.logEvent({
      actorId: params.userId,
      organisationId: params.organisationId,
      action: 'template.clone',
      resourceType: 'bundle_template',
      resourceId: templateId,
      metadata: {
        sourceTemplateId: params.sourceTemplateId,
        name: params.name,
      },
    });

    return this.toTemplateResponse(template);
  }

  private validateRules(rules: any[]): void {
    for (const rule of rules) {
      if (!rule.id || !rule.name || !rule.category || !rule.severity) {
        throw new ValidationError(`Invalid rule: missing required fields`);
      }

      if (rule.category === 'cross_match' && !rule.field) {
        throw new ValidationError(
          `Cross-match rule "${rule.name}" must specify a field`
        );
      }

      if (rule.method === 'regex' && !rule.params?.pattern) {
        throw new ValidationError(
          `Regex rule "${rule.name}" must specify a pattern`
        );
      }
    }
  }

  private toTemplateResponse(template: IBundleTemplate | any) {
    return {
      templateId: template.templateId,
      organisationId: template.organisationId,
      projectId: template.projectId,
      name: template.name,
      description: template.description,
      status: template.status,
      latestVersion: template.latestVersion,
      draft: template.draft,
      isExample: template.isExample,
      clonedFrom: template.clonedFrom,
      starterKey: template.starterKey ?? null,
      createdBy: template.createdBy,
      createdAt: template.createdAt,
      updatedAt: template.updatedAt,
    };
  }

  private toTemplateListItem(template: IBundleTemplate | any) {
    return {
      templateId: template.templateId,
      organisationId: template.organisationId,
      projectId: template.projectId,
      name: template.name,
      description: template.description,
      status: template.status,
      latestVersion: template.latestVersion,
      isExample: template.isExample,
      documentTypeCount: template.draft?.documentTypes?.length || 0,
      ruleCount: template.draft?.rules?.length || 0,
      createdAt: template.createdAt,
      updatedAt: template.updatedAt,
    };
  }
}

export default new BundleTemplateService();
