import { FastifyRequest, FastifyReply } from 'fastify';
import bundleService from '../service/bundle.service';
import responseUtil from '../utils/response.util';
import { resolveOrganisationId } from '../utils/org-access.util';
import { sendBundleError } from '../utils/bundleHttp.util';

export class BundleController {
  public async create(request: FastifyRequest, reply: FastifyReply) {
    const sessionUser = (request as any).user;
    const body = request.body as {
      templateId: string;
      projectId?: string;
      externalRef?: string;
      name?: string;
      profile?: Record<string, unknown>;
      instructionsOverride?: string;
      source?: 'dashboard' | 'api' | 'request_link';
    };

    try {
      const organisationId = resolveOrganisationId(request);

      const result = await bundleService.createBundle({
        userId: sessionUser.userId,
        organisationId,
        templateId: body.templateId,
        projectId: body.projectId,
        externalRef: body.externalRef,
        name: body.name,
        profile: body.profile,
        instructionsOverride: body.instructionsOverride,
        source: body.source,
      });

      return responseUtil.success(reply, 'Bundle created successfully', result, 201);
    } catch (error: unknown) {
      return sendBundleError(reply, error, 'Failed to create bundle');
    }
  }

  public async get(request: FastifyRequest, reply: FastifyReply) {
    const sessionUser = (request as any).user;
    const { bundleId } = request.params as { bundleId: string };

    try {
      const organisationId = resolveOrganisationId(request);

      const result = await bundleService.getBundle(
        sessionUser.userId,
        organisationId,
        bundleId
      );

      return responseUtil.success(reply, 'Bundle retrieved successfully', result);
    } catch (error: unknown) {
      return sendBundleError(reply, error, 'Failed to retrieve bundle');
    }
  }

  public async list(request: FastifyRequest, reply: FastifyReply) {
    const sessionUser = (request as any).user;
    const query = request.query as {
      projectId?: string;
      templateId?: string;
      status?: string;
      externalRef?: string;
      assignee?: string;
      updatedSince?: string;
      q?: string;
      page?: string;
      limit?: string;
    };

    try {
      const organisationId = resolveOrganisationId(request);

      const result = await bundleService.listBundles({
        userId: sessionUser.userId,
        organisationId,
        projectId: query.projectId,
        templateId: query.templateId,
        status: query.status,
        externalRef: query.externalRef,
        assignee: query.assignee,
        updatedSince: query.updatedSince,
        q: query.q,
        page: query.page ? parseInt(query.page, 10) : undefined,
        limit: query.limit ? parseInt(query.limit, 10) : undefined,
      });

      return responseUtil.success(
        reply,
        'Bundles retrieved successfully',
        result.bundles,
        200,
        result.pagination
      );
    } catch (error: unknown) {
      return sendBundleError(reply, error, 'Failed to list bundles');
    }
  }

  public async update(request: FastifyRequest, reply: FastifyReply) {
    const sessionUser = (request as any).user;
    const { bundleId } = request.params as { bundleId: string };
    const body = request.body as {
      name?: string;
      profile?: Record<string, unknown>;
      instructionsOverride?: string;
      assignees?: string[];
      tags?: string[];
      dueAt?: string;
    };

    try {
      const organisationId = resolveOrganisationId(request);

      const result = await bundleService.updateBundle({
        userId: sessionUser.userId,
        organisationId,
        bundleId,
        name: body.name,
        profile: body.profile,
        instructionsOverride: body.instructionsOverride,
        assignees: body.assignees,
        tags: body.tags,
        dueAt: body.dueAt,
      });

      return responseUtil.success(reply, 'Bundle updated successfully', result);
    } catch (error: unknown) {
      return sendBundleError(reply, error, 'Failed to update bundle');
    }
  }

  public async delete(request: FastifyRequest, reply: FastifyReply) {
    const sessionUser = (request as any).user;
    const { bundleId } = request.params as { bundleId: string };
    const { mode } = request.query as { mode?: 'cascade' | 'detach' };

    try {
      const organisationId = resolveOrganisationId(request);

      const result = await bundleService.deleteBundle(
        sessionUser.userId,
        organisationId,
        bundleId,
        mode
      );

      return responseUtil.success(reply, 'Bundle deleted successfully', result);
    } catch (error: unknown) {
      return sendBundleError(reply, error, 'Failed to delete bundle');
    }
  }

  public async attachDocuments(request: FastifyRequest, reply: FastifyReply) {
    const sessionUser = (request as any).user;
    const { bundleId } = request.params as { bundleId: string };
    const body = request.body as {
      documentIds: string[];
      typeKey?: string;
    };

    try {
      const organisationId = resolveOrganisationId(request);

      const result = await bundleService.attachDocuments({
        userId: sessionUser.userId,
        organisationId,
        bundleId,
        documentIds: body.documentIds,
        typeKey: body.typeKey,
      });

      return responseUtil.success(reply, 'Documents attached successfully', result);
    } catch (error: unknown) {
      return sendBundleError(reply, error, 'Failed to attach documents');
    }
  }

  public async removeDocument(request: FastifyRequest, reply: FastifyReply) {
    const sessionUser = (request as any).user;
    const { bundleId, documentId } = request.params as {
      bundleId: string;
      documentId: string;
    };

    try {
      const organisationId = resolveOrganisationId(request);

      const result = await bundleService.removeDocument(
        sessionUser.userId,
        organisationId,
        bundleId,
        documentId
      );

      return responseUtil.success(reply, 'Document removed successfully', result);
    } catch (error: unknown) {
      return sendBundleError(reply, error, 'Failed to remove document');
    }
  }

  public async updateDocument(request: FastifyRequest, reply: FastifyReply) {
    const sessionUser = (request as any).user;
    const { bundleId, documentId } = request.params as {
      bundleId: string;
      documentId: string;
    };
    const body = request.body as { typeKey: string };

    try {
      const organisationId = resolveOrganisationId(request);

      const result = await bundleService.updateBundleDocument({
        userId: sessionUser.userId,
        organisationId,
        bundleId,
        documentId,
        typeKey: body.typeKey,
      });

      return responseUtil.success(reply, 'Document type updated successfully', result);
    } catch (error: unknown) {
      return sendBundleError(reply, error, 'Failed to update document');
    }
  }

  public async uploadDocument(request: FastifyRequest, reply: FastifyReply) {
    const sessionUser = (request as any).user;
    const { bundleId } = request.params as { bundleId: string };

    try {
      const organisationId = resolveOrganisationId(request);

      let fileBuffer: Buffer | null = null;
      let originalFilename = '';
      let mimeType = '';
      let typeKey: string | undefined;

      const parts = request.parts();
      for await (const part of parts) {
        if (part.type === 'file') {
          fileBuffer = await part.toBuffer();
          originalFilename = part.filename;
          mimeType = part.mimetype;
        } else if (part.fieldname === 'typeKey') {
          typeKey = String(part.value || '').trim() || undefined;
        }
      }

      if (!fileBuffer || !originalFilename) {
        return responseUtil.error(reply, 'No file provided', 400);
      }

      const result = await bundleService.uploadDocument(
        sessionUser.userId,
        organisationId,
        bundleId,
        { buffer: fileBuffer, filename: originalFilename, mimetype: mimeType },
        typeKey
      );

      return responseUtil.success(reply, 'Document uploaded successfully', result, 201);
    } catch (error: unknown) {
      return sendBundleError(reply, error, 'Failed to upload document');
    }
  }

  public async createRun(request: FastifyRequest, reply: FastifyReply) {
    const sessionUser = (request as any).user;
    const { bundleId } = request.params as { bundleId: string };
    const body = (request.body || {}) as {
      templateVersion?: 'pinned' | 'latest';
      trigger?: 'manual' | 'api';
    };

    try {
      const organisationId = resolveOrganisationId(request);

      const result = await bundleService.createRun({
        userId: sessionUser.userId,
        organisationId,
        bundleId,
        templateVersion: body.templateVersion,
        trigger: body.trigger,
      });

      return responseUtil.success(reply, 'Run created', result, 202);
    } catch (error: unknown) {
      return sendBundleError(reply, error, 'Failed to create run');
    }
  }

  public async listRuns(request: FastifyRequest, reply: FastifyReply) {
    const sessionUser = (request as any).user;
    const { bundleId } = request.params as { bundleId: string };

    try {
      const organisationId = resolveOrganisationId(request);

      const result = await bundleService.listRuns(
        sessionUser.userId,
        organisationId,
        bundleId
      );

      return responseUtil.success(reply, 'Runs retrieved successfully', result);
    } catch (error: unknown) {
      return sendBundleError(reply, error, 'Failed to list runs');
    }
  }

  public async getRun(request: FastifyRequest, reply: FastifyReply) {
    const sessionUser = (request as any).user;
    const { bundleId, runId } = request.params as {
      bundleId: string;
      runId: string;
    };

    try {
      const organisationId = resolveOrganisationId(request);

      const result = await bundleService.getRun(
        sessionUser.userId,
        organisationId,
        bundleId,
        runId
      );

      return responseUtil.success(reply, 'Run retrieved successfully', result);
    } catch (error: unknown) {
      return sendBundleError(reply, error, 'Failed to retrieve run');
    }
  }

  public async actOnConflict(request: FastifyRequest, reply: FastifyReply) {
    const sessionUser = (request as any).user;
    const { bundleId } = request.params as { bundleId: string };
    const body = request.body as {
      field: string;
      valuesHash: string;
      action: 'resolve' | 'dismiss' | 'reopen';
      value?: string | null;
      reason?: string | null;
    };
    try {
      const organisationId = resolveOrganisationId(request);
      const result = await bundleService.actOnConflict({
        userId: sessionUser.userId,
        organisationId,
        bundleId,
        field: body.field,
        valuesHash: body.valuesHash,
        action: body.action,
        value: body.value,
        reason: body.reason,
      });
      return responseUtil.success(reply, 'Conflict updated', result);
    } catch (error: unknown) {
      return sendBundleError(reply, error, 'Failed to update conflict');
    }
  }

  public async markReviewed(request: FastifyRequest, reply: FastifyReply) {
    const sessionUser = (request as any).user;
    const { bundleId } = request.params as { bundleId: string };
    const body = (request.body || {}) as { note?: string | null };
    try {
      const organisationId = resolveOrganisationId(request);
      const result = await bundleService.markReviewed({
        userId: sessionUser.userId,
        organisationId,
        bundleId,
        note: body.note,
      });
      return responseUtil.success(reply, 'Bundle marked reviewed', result);
    } catch (error: unknown) {
      return sendBundleError(reply, error, 'Failed to mark bundle reviewed');
    }
  }

  public async timeline(request: FastifyRequest, reply: FastifyReply) {
    const sessionUser = (request as any).user;
    const { bundleId } = request.params as { bundleId: string };
    const { limit } = (request.query || {}) as { limit?: string };
    try {
      const organisationId = resolveOrganisationId(request);
      const result = await bundleService.getTimeline(
        sessionUser.userId,
        organisationId,
        bundleId,
        limit ? parseInt(limit, 10) : undefined
      );
      return responseUtil.success(reply, 'Timeline retrieved successfully', result);
    } catch (error: unknown) {
      return sendBundleError(reply, error, 'Failed to load timeline');
    }
  }
}

export default new BundleController();
