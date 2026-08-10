import { FastifyRequest, FastifyReply } from 'fastify';
import documentService from '../service/document.service';
import responseUtil from '../utils/response.util';
import { resolveOrganisationId } from '../utils/org-access.util';

export class DocumentController {
  public async upload(request: FastifyRequest, reply: FastifyReply) {
    const sessionUser = (request as any).user;

    try {
      const organisationId = resolveOrganisationId(request);
      let projectId = '';
      let fileBuffer: Buffer | null = null;
      let originalFilename = '';
      let mimeType = '';
      let consentGivenAt: Date | null = null;

      const parts = request.parts();
      for await (const part of parts) {
        if (part.type === 'file') {
          fileBuffer = await part.toBuffer();
          originalFilename = part.filename;
          mimeType = part.mimetype;
        } else if (part.fieldname === 'projectId') {
          projectId = String(part.value);
        } else if (part.fieldname === 'consentGivenAt') {
          const rawValue = String(part.value).trim();
          if (rawValue) {
            const parsed = new Date(rawValue);
            if (Number.isNaN(parsed.getTime())) {
              return responseUtil.error(
                reply,
                'consentGivenAt must be a valid ISO date',
                400
              );
            }
            consentGivenAt = parsed;
          }
        }
      }

      if (!projectId) {
        return responseUtil.error(reply, 'projectId is required', 400);
      }

      if (!fileBuffer || !originalFilename) {
        return responseUtil.error(reply, 'No file provided', 400);
      }

      const result = await documentService.uploadDocument({
        userId: sessionUser.userId,
        organisationId,
        projectId,
        originalFilename,
        mimeType,
        buffer: fileBuffer,
        consentGivenAt,
      });

      return responseUtil.success(
        reply,
        'Document uploaded successfully',
        result,
        201
      );
    } catch (error: any) {
      const status =
        error.message?.includes('not found') ||
        error.message?.includes('allowed') ||
        error.message?.includes('large')
          ? 400
          : 500;
      return responseUtil.error(
        reply,
        error.message || 'Failed to upload document',
        status
      );
    }
  }

  public async list(request: FastifyRequest, reply: FastifyReply) {
    const sessionUser = (request as any).user;
    const { projectId, limit } = request.query as {
      projectId?: string;
      limit?: string;
    };

    try {
      const organisationId = resolveOrganisationId(request);

      if (projectId) {
        const documents = await documentService.listDocuments(
          sessionUser.userId,
          organisationId,
          projectId
        );

        return responseUtil.success(
          reply,
          'Documents retrieved successfully',
          documents
        );
      }

      const parsedLimit = limit ? Number(limit) : undefined;
      const documents = await documentService.listAllDocuments(
        sessionUser.userId,
        organisationId,
        { limit: parsedLimit }
      );

      return responseUtil.success(
        reply,
        'Documents retrieved successfully',
        documents
      );
    } catch (error: any) {
      return responseUtil.error(
        reply,
        error.message || 'Failed to list documents',
        500
      );
    }
  }

  public async downloadFile(request: FastifyRequest, reply: FastifyReply) {
    const sessionUser = (request as any).user;
    const { documentId } = request.params as { documentId: string };

    try {
      const organisationId = resolveOrganisationId(request);
      const file = await documentService.getDocumentFile(
        sessionUser.userId,
        organisationId,
        documentId
      );

      return reply
        .header('Content-Type', file.mimeType)
        .header(
          'Content-Disposition',
          `inline; filename="${file.filename.replace(/"/g, '')}"`
        )
        .header('Cache-Control', 'private, max-age=3600')
        .send(file.buffer);
    } catch (error: any) {
      const status = error.message === 'Document not found' ? 404 : 500;
      return responseUtil.error(
        reply,
        error.message || 'Failed to download document',
        status
      );
    }
  }

  public async deleteOne(request: FastifyRequest, reply: FastifyReply) {
    const sessionUser = (request as any).user;
    const { documentId } = request.params as { documentId: string };

    try {
      const organisationId = resolveOrganisationId(request);
      const result = await documentService.deleteDocument(
        sessionUser.userId,
        organisationId,
        documentId
      );

      return responseUtil.success(reply, 'Document deleted successfully', result);
    } catch (error: any) {
      const status = error.message === 'Document not found' ? 404 : 500;
      return responseUtil.error(
        reply,
        error.message || 'Failed to delete document',
        status
      );
    }
  }

  public async getOne(request: FastifyRequest, reply: FastifyReply) {
    const sessionUser = (request as any).user;
    const { documentId } = request.params as { documentId: string };

    try {
      const organisationId = resolveOrganisationId(request);
      const result = await documentService.getDocument(
        sessionUser.userId,
        organisationId,
        documentId
      );

      return responseUtil.success(
        reply,
        'Document retrieved successfully',
        result
      );
    } catch (error: any) {
      const status = error.message === 'Document not found' ? 404 : 500;
      return responseUtil.error(
        reply,
        error.message || 'Failed to retrieve document',
        status
      );
    }
  }
}

export default new DocumentController();