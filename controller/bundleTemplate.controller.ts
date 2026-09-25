import { FastifyRequest, FastifyReply } from 'fastify';
import bundleTemplateService from '../service/bundleTemplate.service';
import responseUtil from '../utils/response.util';
import { resolveOrganisationId } from '../utils/org-access.util';
import { isAppError } from '../utils/errors.util';

export class BundleTemplateController {
  public async create(request: FastifyRequest, reply: FastifyReply) {
    const sessionUser = (request as any).user;
    const body = request.body as {
      name: string;
      description?: string;
      projectId?: string;
      draft?: any;
    };

    try {
      const organisationId = resolveOrganisationId(request);

      const result = await bundleTemplateService.createTemplate({
        userId: sessionUser.userId,
        organisationId,
        name: body.name,
        description: body.description,
        projectId: body.projectId,
        draft: body.draft,
      });

      return responseUtil.success(
        reply,
        'Template created successfully',
        result,
        201
      );
    } catch (error: any) {
      if (isAppError(error)) {
        return responseUtil.error(reply, error.message, error.statusCode);
      }
      return responseUtil.error(reply, error.message || 'Failed to create template', 500);
    }
  }

  public async get(request: FastifyRequest, reply: FastifyReply) {
    const sessionUser = (request as any).user;
    const { templateId } = request.params as { templateId: string };

    try {
      const organisationId = resolveOrganisationId(request);

      const result = await bundleTemplateService.getTemplate(
        sessionUser.userId,
        organisationId,
        templateId
      );

      return responseUtil.success(reply, 'Template retrieved successfully', result);
    } catch (error: any) {
      if (isAppError(error)) {
        return responseUtil.error(reply, error.message, error.statusCode);
      }
      return responseUtil.error(reply, error.message || 'Failed to retrieve template', 500);
    }
  }

  public async list(request: FastifyRequest, reply: FastifyReply) {
    const sessionUser = (request as any).user;
    const query = request.query as {
      projectId?: string;
      status?: string;
      includeExamples?: string;
      page?: string;
      limit?: string;
    };

    try {
      const organisationId = resolveOrganisationId(request);

      const result = await bundleTemplateService.listTemplates({
        userId: sessionUser.userId,
        organisationId,
        projectId: query.projectId,
        status: query.status,
        includeExamples: query.includeExamples === 'true',
        page: query.page ? parseInt(query.page, 10) : undefined,
        limit: query.limit ? parseInt(query.limit, 10) : undefined,
      });

      return responseUtil.success(
        reply,
        'Templates retrieved successfully',
        result.templates,
        200,
        result.pagination
      );
    } catch (error: any) {
      if (isAppError(error)) {
        return responseUtil.error(reply, error.message, error.statusCode);
      }
      return responseUtil.error(reply, error.message || 'Failed to list templates', 500);
    }
  }

  public async update(request: FastifyRequest, reply: FastifyReply) {
    const sessionUser = (request as any).user;
    const { templateId } = request.params as { templateId: string };
    const body = request.body as {
      name?: string;
      description?: string;
      draft?: any;
      status?: 'draft' | 'archived';
    };

    try {
      const organisationId = resolveOrganisationId(request);

      const result = await bundleTemplateService.updateTemplate({
        userId: sessionUser.userId,
        organisationId,
        templateId,
        name: body.name,
        description: body.description,
        draft: body.draft,
        status: body.status,
      });

      return responseUtil.success(reply, 'Template updated successfully', result);
    } catch (error: any) {
      if (isAppError(error)) {
        return responseUtil.error(reply, error.message, error.statusCode);
      }
      return responseUtil.error(reply, error.message || 'Failed to update template', 500);
    }
  }

  public async delete(request: FastifyRequest, reply: FastifyReply) {
    const sessionUser = (request as any).user;
    const { templateId } = request.params as { templateId: string };

    try {
      const organisationId = resolveOrganisationId(request);

      const result = await bundleTemplateService.deleteTemplate(
        sessionUser.userId,
        organisationId,
        templateId
      );

      return responseUtil.success(reply, 'Template deleted successfully', result);
    } catch (error: any) {
      if (isAppError(error)) {
        return responseUtil.error(reply, error.message, error.statusCode);
      }
      return responseUtil.error(reply, error.message || 'Failed to delete template', 500);
    }
  }

  public async publish(request: FastifyRequest, reply: FastifyReply) {
    const sessionUser = (request as any).user;
    const { templateId } = request.params as { templateId: string };
    const body = (request.body || {}) as { changelog?: string };

    try {
      const organisationId = resolveOrganisationId(request);

      const result = await bundleTemplateService.publishTemplate({
        userId: sessionUser.userId,
        organisationId,
        templateId,
        changelog: body.changelog,
      });

      return responseUtil.success(reply, 'Template published successfully', result);
    } catch (error: any) {
      if (isAppError(error)) {
        return responseUtil.error(reply, error.message, error.statusCode);
      }
      return responseUtil.error(reply, error.message || 'Failed to publish template', 500);
    }
  }

  public async listVersions(request: FastifyRequest, reply: FastifyReply) {
    const sessionUser = (request as any).user;
    const { templateId } = request.params as { templateId: string };

    try {
      const organisationId = resolveOrganisationId(request);

      const result = await bundleTemplateService.listVersions(
        sessionUser.userId,
        organisationId,
        templateId
      );

      return responseUtil.success(reply, 'Versions retrieved successfully', result);
    } catch (error: any) {
      if (isAppError(error)) {
        return responseUtil.error(reply, error.message, error.statusCode);
      }
      return responseUtil.error(reply, error.message || 'Failed to list versions', 500);
    }
  }

  public async getVersion(request: FastifyRequest, reply: FastifyReply) {
    const sessionUser = (request as any).user;
    const { templateId, version } = request.params as {
      templateId: string;
      version: string;
    };

    try {
      const organisationId = resolveOrganisationId(request);

      const result = await bundleTemplateService.getVersion(
        sessionUser.userId,
        organisationId,
        templateId,
        parseInt(version, 10)
      );

      return responseUtil.success(reply, 'Version retrieved successfully', result);
    } catch (error: any) {
      if (isAppError(error)) {
        return responseUtil.error(reply, error.message, error.statusCode);
      }
      return responseUtil.error(reply, error.message || 'Failed to retrieve version', 500);
    }
  }

  public async clone(request: FastifyRequest, reply: FastifyReply) {
    const sessionUser = (request as any).user;
    const { templateId } = request.params as { templateId: string };
    const body = request.body as { name: string; projectId?: string };

    try {
      const organisationId = resolveOrganisationId(request);

      const result = await bundleTemplateService.cloneTemplate({
        userId: sessionUser.userId,
        organisationId,
        sourceTemplateId: templateId,
        name: body.name,
        projectId: body.projectId,
      });

      return responseUtil.success(
        reply,
        'Template cloned successfully',
        result,
        201
      );
    } catch (error: any) {
      if (isAppError(error)) {
        return responseUtil.error(reply, error.message, error.statusCode);
      }
      return responseUtil.error(reply, error.message || 'Failed to clone template', 500);
    }
  }
}

export default new BundleTemplateController();
