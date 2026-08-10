import { FastifyRequest, FastifyReply } from 'fastify';
import envelopeService from '../service/envelope.service';
import responseUtil from '../utils/response.util';
import { resolveOrganisationId } from '../utils/org-access.util';
import {
  EnvelopeFieldType,
  EnvelopeSignerRole,
} from '../model/envelope.model';

export class EnvelopeController {
  public async create(request: FastifyRequest, reply: FastifyReply) {
    const sessionUser = (request as any).user;

    try {
      const organisationId = resolveOrganisationId(
        request,
        (request.body as { organisationId?: string })?.organisationId
      );
      const body = request.body as {
        documentId?: string;
        title?: string;
        message?: string;
        signers?: {
          name: string;
          email: string;
          role?: EnvelopeSignerRole;
          order?: number;
        }[];
        fields?: {
          type: EnvelopeFieldType;
          page: number;
          x: number;
          y: number;
          width: number;
          height: number;
          signerIndex?: number;
          label?: string;
          required?: boolean;
        }[];
      };

      if (!body.documentId) {
        return responseUtil.error(reply, 'documentId is required', 400);
      }

      if (!body.title?.trim()) {
        return responseUtil.error(reply, 'title is required', 400);
      }

      if (!body.signers?.length) {
        return responseUtil.error(reply, 'At least one signer is required', 400);
      }

      const envelope = await envelopeService.createEnvelope({
        userId: sessionUser.userId,
        organisationId,
        documentId: body.documentId,
        title: body.title,
        message: body.message,
        signers: body.signers,
        fields: body.fields,
      });

      return responseUtil.success(
        reply,
        'Envelope created successfully',
        envelope,
        201
      );
    } catch (error: any) {
      const status =
        error.message === 'Document not found'
          ? 404
          : error.message?.includes('required') ||
              error.message?.includes('signer')
            ? 400
            : error.message?.includes('access')
              ? 403
              : 500;

      return responseUtil.error(
        reply,
        error.message || 'Failed to create envelope',
        status
      );
    }
  }

  public async list(request: FastifyRequest, reply: FastifyReply) {
    const sessionUser = (request as any).user;

    try {
      const organisationId = resolveOrganisationId(request);
      const envelopes = await envelopeService.listEnvelopes(
        sessionUser.userId,
        organisationId
      );

      return responseUtil.success(
        reply,
        'Envelopes retrieved successfully',
        envelopes
      );
    } catch (error: any) {
      return responseUtil.error(
        reply,
        error.message || 'Failed to list envelopes',
        error.message?.includes('Organisation context') ? 400 : 500
      );
    }
  }

  public async getOne(request: FastifyRequest, reply: FastifyReply) {
    const sessionUser = (request as any).user;
    const { id } = request.params as { id: string };

    try {
      const organisationId = resolveOrganisationId(request);
      const envelope = await envelopeService.getEnvelope(
        sessionUser.userId,
        organisationId,
        id
      );

      return responseUtil.success(
        reply,
        'Envelope retrieved successfully',
        envelope
      );
    } catch (error: any) {
      const status = error.message === 'Envelope not found' ? 404 : 500;
      return responseUtil.error(
        reply,
        error.message || 'Failed to retrieve envelope',
        status
      );
    }
  }

  public async send(request: FastifyRequest, reply: FastifyReply) {
    const sessionUser = (request as any).user;
    const { id } = request.params as { id: string };

    try {
      const organisationId = resolveOrganisationId(request);
      const result = await envelopeService.sendEnvelope(
        sessionUser.userId,
        organisationId,
        id
      );

      return responseUtil.success(
        reply,
        'Envelope sent successfully',
        result
      );
    } catch (error: any) {
      const status =
        error.message === 'Envelope not found'
          ? 404
          : error.message?.includes('draft') ||
              error.message?.includes('signers')
            ? 400
            : 500;

      return responseUtil.error(
        reply,
        error.message || 'Failed to send envelope',
        status
      );
    }
  }

  public async getByToken(request: FastifyRequest, reply: FastifyReply) {
    const { token } = request.params as { token: string };

    try {
      const envelope = await envelopeService.getEnvelopeByToken(token);

      return responseUtil.success(
        reply,
        'Envelope retrieved successfully',
        envelope
      );
    } catch (error: any) {
      const status =
        error.message === 'Signing link not found or expired' ||
        error.message === 'Signer not found' ||
        error.message === 'Envelope is not available for signing'
          ? 404
          : 500;

      return responseUtil.error(
        reply,
        error.message || 'Failed to retrieve envelope',
        status
      );
    }
  }

  public async getFileByToken(request: FastifyRequest, reply: FastifyReply) {
    const { token } = request.params as { token: string };

    try {
      const file = await envelopeService.getEnvelopeFileByToken(token);

      return reply
        .header('Content-Type', file.mimeType)
        .header(
          'Content-Disposition',
          `inline; filename="${file.filename.replace(/"/g, '')}"`
        )
        .send(file.buffer);
    } catch (error: any) {
      const status =
        error.message === 'Signing link not found or expired' ||
        error.message === 'Document not found' ||
        error.message === 'Envelope is not available for signing'
          ? 404
          : 500;

      return responseUtil.error(
        reply,
        error.message || 'Failed to retrieve document',
        status
      );
    }
  }

  public async sign(request: FastifyRequest, reply: FastifyReply) {
    const { token } = request.params as { token: string };
    const body = request.body as { fieldValues?: Record<string, string> };

    try {
      const result = await envelopeService.signEnvelope(
        token,
        body.fieldValues || {}
      );

      return responseUtil.success(reply, 'Envelope signed successfully', result);
    } catch (error: any) {
      const status =
        error.message === 'Signing link not found or expired' ||
        error.message === 'Signer not found' ||
        error.message === 'Envelope is not available for signing'
          ? 404
          : error.message === 'Already signed'
            ? 409
            : error.message?.includes('required') ||
                error.message?.includes('cannot sign')
              ? 400
              : 500;

      return responseUtil.error(
        reply,
        error.message || 'Failed to sign envelope',
        status
      );
    }
  }
}

export default new EnvelopeController();
