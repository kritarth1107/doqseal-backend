import { FastifyRequest, FastifyReply } from 'fastify';
import projectService from '../service/project.service';
import responseUtil from '../utils/response.util';
import { resolveOrganisationId } from '../utils/org-access.util';

export class ProjectController {
  public async create(request: FastifyRequest, reply: FastifyReply) {
    const sessionUser = (request as any).user;

    try {
      const organisationId = resolveOrganisationId(
        request,
        (request.body as { organisationId?: string })?.organisationId
      );
      const body = request.body as {
        name: string;
        description?: string;
        extractionHint?: string;
        fields?: any[];
        crossFieldRules?: Record<string, unknown>[];
        sharedWithOrganisation?: boolean;
      };

      if (!body.name || body.name.trim().length < 2) {
        return responseUtil.error(
          reply,
          'Project name must be at least 2 characters',
          400
        );
      }

      const project = await projectService.createProject({
        userId: sessionUser.userId,
        organisationId,
        name: body.name,
        description: body.description,
        extractionHint: body.extractionHint,
        fields: body.fields,
        crossFieldRules: body.crossFieldRules,
        sharedWithOrganisation: body.sharedWithOrganisation,
      });

      return responseUtil.success(
        reply,
        'Project created successfully',
        project,
        201
      );
    } catch (error: any) {
      return responseUtil.error(
        reply,
        error.message || 'Failed to create project',
        error.message?.includes('access') ? 403 : 500
      );
    }
  }

  public async list(request: FastifyRequest, reply: FastifyReply) {
    const sessionUser = (request as any).user;

    try {
      const organisationId = resolveOrganisationId(request);
      const projects = await projectService.listProjects(
        sessionUser.userId,
        organisationId
      );
      return responseUtil.success(
        reply,
        'Projects retrieved successfully',
        projects
      );
    } catch (error: any) {
      return responseUtil.error(
        reply,
        error.message || 'Failed to list projects',
        error.message?.includes('Organisation context') ? 400 : 500
      );
    }
  }

  public async getOne(request: FastifyRequest, reply: FastifyReply) {
    const sessionUser = (request as any).user;
    const { projectId } = request.params as { projectId: string };

    try {
      const organisationId = resolveOrganisationId(request);
      const project = await projectService.getProject(
        sessionUser.userId,
        organisationId,
        projectId
      );
      return responseUtil.success(
        reply,
        'Project retrieved successfully',
        project
      );
    } catch (error: any) {
      const status = error.message === 'Project not found' ? 404 : 500;
      return responseUtil.error(
        reply,
        error.message || 'Failed to retrieve project',
        status
      );
    }
  }
}

export default new ProjectController();