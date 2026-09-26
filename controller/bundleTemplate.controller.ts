import { FastifyRequest, FastifyReply } from 'fastify';
import bundleTemplateService from '../service/bundleTemplate.service';
import responseUtil from '../utils/response.util';
import { resolveOrganisationId } from '../utils/org-access.util';
import { sendBundleError } from '../utils/bundleHttp.util';

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
    } catch (error: unknown) {
      return sendBundleError(reply, error, 'Failed to create template');
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
    } catch (error: unknown) {
      return sendBundleError(reply, error, 'Failed to retrieve template');
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
    } catch (error: unknown) {
      return sendBundleError(reply, error, 'Failed to list templates');
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
    } catch (error: unknown) {
      return sendBundleError(reply, error, 'Failed to update template');
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
    } catch (error: unknown) {
      return sendBundleError(reply, error, 'Failed to delete template');
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
    } catch (error: unknown) {
      return sendBundleError(reply, error, 'Failed to publish template');
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
    } catch (error: unknown) {
      return sendBundleError(reply, error, 'Failed to list versions');
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
    } catch (error: unknown) {
      return sendBundleError(reply, error, 'Failed to retrieve version');
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
    } catch (error: unknown) {
      return sendBundleError(reply, error, 'Failed to clone template');
    }
  }

  public async listStarters(request: FastifyRequest, reply: FastifyReply) {
    const sessionUser = (request as any).user;
    try {
      const organisationId = resolveOrganisationId(request);
      const result = await bundleTemplateService.listStarters(sessionUser.userId, organisationId);
      return responseUtil.success(reply, 'Starter templates retrieved successfully', result);
    } catch (error: unknown) {
      return sendBundleError(reply, error, 'Failed to list starter templates');
    }
  }

  public async createFromStarter(request: FastifyRequest, reply: FastifyReply) {
    const sessionUser = (request as any).user;
    const { starterKey } = request.params as { starterKey: string };
    const body = (request.body || {}) as { name?: string | null; projectId?: string | null };
    try {
      const organisationId = resolveOrganisationId(request);
      const result = await bundleTemplateService.createFromStarter({
        userId: sessionUser.userId,
        organisationId,
        starterKey,
        name: body.name,
        projectId: body.projectId,
      });
      return responseUtil.success(
        reply,
        result.created ? 'Template created from starter' : 'Template already exists for this starter',
        result,
        result.created ? 201 : 200
      );
    } catch (error: unknown) {
      return sendBundleError(reply, error, 'Failed to create template from starter');
    }
  }
}

export default new BundleTemplateController();
