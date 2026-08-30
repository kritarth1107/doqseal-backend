import Project, { IProject, IProjectField } from '../model/project.model';
import { v4 as uuidv4 } from 'uuid';
import { assertUserInOrganisation } from '../utils/org-access.util';
import { visibilityFilter } from '../utils/visibility.util';

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
      extractionHint: extractionHint || '',
      fields: fields || [],
      crossFieldRules: crossFieldRules || [],
      status: 'active',
      createdBy: userId,
      sharedWithOrganisation,
    });

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
      extractionHint: project.extractionHint,
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
