import Project, { IProject, IProjectField } from '../model/project.model';
import { v4 as uuidv4 } from 'uuid';
import { assertUserInOrganisation } from '../utils/org-access.util';
import { visibilityFilter } from '../utils/visibility.util';
import { dispatchOrganisationWebhooks } from './webhook.service';

export class ProjectService {
  public async createProject(params: {
    userId: string;
    organisationId: string;
    name: string;
    description?: string;
    extractionHint?: string;
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

    const project = await Project.create({
      projectId: uuidv4(),
      organisationId,
      name: name.trim(),
      description: description || '',
      extractionHint: (extractionHint || '').trim(),
      webhooks: [],
      webhookUrls: [],
      fields: fields || [],
      crossFieldRules: crossFieldRules || [],
      status: 'active',
      createdBy: userId,
      sharedWithOrganisation,
    });

    try {
      await dispatchOrganisationWebhooks(organisationId, {
        event: 'project.created',
        organisationId,
        projectId: project.projectId,
        metadata: { name: project.name },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.warn('[webhook] project.created dispatch failed', error);
    }

    return this.toPublic(project);
  }

  public async updateProject(params: {
    userId: string;
    organisationId: string;
    projectId: string;
    name?: string;
    description?: string;
    extractionHint?: string;
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
    return {
      projectId: project.projectId,
      organisationId: project.organisationId,
      name: project.name,
      description: project.description,
      extractionHint: project.extractionHint || '',
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
