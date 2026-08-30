import Project, { IProject, IProjectField } from '../model/project.model';
import { v4 as uuidv4 } from 'uuid';
import { assertUserInOrganisation } from '../utils/org-access.util';
import { visibilityFilter } from '../utils/visibility.util';
import {
  coerceProjectWebhooks,
  normalizeProjectWebhooks,
} from './webhook.service';
import { ProjectWebhook } from '../constants/webhook.events';

export class ProjectService {
  public async createProject(params: {
    userId: string;
    organisationId: string;
    name: string;
    description?: string;
    extractionHint?: string;
    webhooks?: ProjectWebhook[];
    webhookUrls?: string[];
    fields?: IProjectField[];
    crossFieldRules?: Record<string, unknown>[];
    sharedWithOrganisation?: boolean;
  }) {
    const {
      userId,
      organisationId,
      name,
      description,
      extractionHint,
      fields,
      crossFieldRules,
    } = params;

    await assertUserInOrganisation(userId, organisationId);

    const sharedWithOrganisation =
      typeof params.sharedWithOrganisation === 'boolean'
        ? params.sharedWithOrganisation
        : true;

    const webhooks = normalizeProjectWebhooks(
      params.webhooks ?? params.webhookUrls ?? []
    );

    const project = await Project.create({
      projectId: uuidv4(),
      organisationId,
      name: name.trim(),
      description: description || '',
      extractionHint: (extractionHint || '').trim(),
      webhooks,
      webhookUrls: [],
      fields: fields || [],
      crossFieldRules: crossFieldRules || [],
      status: 'active',
      createdBy: userId,
      sharedWithOrganisation,
    });

    return this.toPublic(project);
  }

  public async updateProject(params: {
    userId: string;
    organisationId: string;
    projectId: string;
    name?: string;
    description?: string;
    extractionHint?: string;
    webhooks?: ProjectWebhook[];
    webhookUrls?: string[];
    sharedWithOrganisation?: boolean;
    status?: 'active' | 'archived';
    deleteProject?: boolean;
  }) {
    const { userId, organisationId, projectId } = params;
    await assertUserInOrganisation(userId, organisationId);

    const project = await Project.findOne({
      projectId,
      organisationId,
      deletedAt: null,
      ...visibilityFilter(userId, 'createdBy'),
    });

    if (!project) {
      throw new Error('Project not found');
    }

    if (params.deleteProject === true) {
      project.deletedAt = new Date();
      project.status = 'archived';
      await project.save();
      return this.toPublic(project);
    }

    if (typeof params.name === 'string') {
      const trimmed = params.name.trim();
      if (trimmed.length < 2) {
        throw new Error('Project name must be at least 2 characters');
      }
      project.name = trimmed;
    }

    if (typeof params.description === 'string') {
      project.description = params.description.trim();
    }

    if (typeof params.extractionHint === 'string') {
      project.extractionHint = params.extractionHint.trim();
    }

    if (params.webhooks !== undefined || params.webhookUrls !== undefined) {
      project.webhooks = normalizeProjectWebhooks(
        params.webhooks ?? params.webhookUrls ?? []
      );
      project.webhookUrls = [];
      project.markModified('webhooks');
    }

    if (typeof params.sharedWithOrganisation === 'boolean') {
      project.sharedWithOrganisation = params.sharedWithOrganisation;
    }

    if (params.status === 'active' || params.status === 'archived') {
      project.status = params.status;
    }

    await project.save();
    return this.toPublic(project);
  }

  public async listProjects(userId: string, organisationId: string) {
    await assertUserInOrganisation(userId, organisationId);

    const projects = await Project.find({
      organisationId,
      deletedAt: null,
      status: 'active',
      ...visibilityFilter(userId, 'createdBy'),
    })
      .sort({ updatedAt: -1 })
      .lean();

    return projects.map((project) => this.toPublic(project));
  }

  public async getProject(
    userId: string,
    organisationId: string,
    projectId: string
  ) {
    await assertUserInOrganisation(userId, organisationId);

    const project = await Project.findOne({
      projectId,
      organisationId,
      deletedAt: null,
      ...visibilityFilter(userId, 'createdBy'),
    }).lean();

    if (!project) {
      throw new Error('Project not found');
    }

    return this.toPublic(project);
  }

  public async getProjectForWorker(projectId: string) {
    const project = await Project.findOne({
      projectId,
      deletedAt: null,
    }).lean();

    if (!project) {
      throw new Error('Project not found');
    }

    return project;
  }

  private toPublic(project: IProject | Record<string, any>) {
    const webhooks = coerceProjectWebhooks(project);
    return {
      projectId: project.projectId,
      organisationId: project.organisationId,
      name: project.name,
      description: project.description,
      extractionHint: project.extractionHint || '',
      webhooks,
      // Convenience for older clients / summary chips
      webhookUrls: webhooks.map((w) => w.url),
      fields: project.fields,
      crossFieldRules: project.crossFieldRules,
      status: project.status,
      createdBy: project.createdBy,
      sharedWithOrganisation: project.sharedWithOrganisation !== false,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
    };
  }
}

export default new ProjectService();
