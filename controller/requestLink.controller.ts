import { FastifyRequest, FastifyReply } from 'fastify';
import requestLinkService from '../service/requestLink.service';
import responseUtil from '../utils/response.util';
import { resolveOrganisationId } from '../utils/org-access.util';

export class RequestLinkController {
  public create = async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = (request as any).user;
      const organisationId = resolveOrganisationId(request);
      const body = request.body as any;
      const result = await requestLinkService.create({
        userId: user.userId,
        organisationId,
        title: body.title,
        description: body.description,
        requirements: body.requirements || [],
        settings: body.settings,
        projectId: body.projectId,
        expiresAt: body.expiresAt,
      });
      return responseUtil.success(reply, 'Request link created', result, 201);
    } catch (error: any) {
      return responseUtil.error(reply, error.message || 'Failed to create', 400);
    }
  };

  public list = async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = (request as any).user;
      const organisationId = resolveOrganisationId(request);
      const result = await requestLinkService.list(user.userId, organisationId);
      return responseUtil.success(reply, 'Request links retrieved', result);
    } catch (error: any) {
      return responseUtil.error(reply, error.message || 'Failed to list', 400);
    }
  };

  public getOne = async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = (request as any).user;
      const organisationId = resolveOrganisationId(request);
      const { requestLinkId } = request.params as { requestLinkId: string };
      const result = await requestLinkService.getOne(
        user.userId,
        organisationId,
        requestLinkId
      );
      return responseUtil.success(reply, 'Request link retrieved', result);
    } catch (error: any) {
      const status = error.message?.includes('not found') ? 404 : 400;
      return responseUtil.error(reply, error.message || 'Failed', status);
    }
  };

  public update = async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = (request as any).user;
      const organisationId = resolveOrganisationId(request);
      const { requestLinkId } = request.params as { requestLinkId: string };
      const result = await requestLinkService.update(
        user.userId,
        organisationId,
        requestLinkId,
        request.body as any
      );
      return responseUtil.success(reply, 'Request link updated', result);
    } catch (error: any) {
      return responseUtil.error(reply, error.message || 'Failed to update', 400);
    }
  };

  public listSubmissions = async (
    request: FastifyRequest,
    reply: FastifyReply
  ) => {
    try {
      const user = (request as any).user;
      const organisationId = resolveOrganisationId(request);
      const { requestLinkId } = request.params as { requestLinkId: string };
      const result = await requestLinkService.listSubmissions(
        user.userId,
        organisationId,
        requestLinkId
      );
      return responseUtil.success(reply, 'Submissions retrieved', result);
    } catch (error: any) {
      return responseUtil.error(reply, error.message || 'Failed', 400);
    }
  };

  public getPublic = async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { slugOrToken } = request.params as { slugOrToken: string };
      const result = await requestLinkService.getPublicBySlugOrToken(slugOrToken);
      return responseUtil.success(reply, 'Collection link retrieved', result);
    } catch (error: any) {
      return responseUtil.error(reply, error.message || 'Unavailable', 404);
    }
  };

  public requestOtp = async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { slugOrToken } = request.params as { slugOrToken: string };
      const body = request.body as {
        channel: 'email' | 'mobile';
        email?: string;
        mobile?: string;
      };
      const result = await requestLinkService.requestOtp({
        slugOrToken,
        channel: body.channel,
        email: body.email,
        mobile: body.mobile,
      });
      return responseUtil.success(reply, 'OTP sent', result);
    } catch (error: any) {
      return responseUtil.error(reply, error.message || 'OTP failed', 400);
    }
  };

  public verifyOtp = async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { slugOrToken } = request.params as { slugOrToken: string };
      const body = request.body as { challengeToken: string; otp: string };
      const result = await requestLinkService.verifyOtp({
        slugOrToken,
        challengeToken: body.challengeToken,
        otp: body.otp,
      });
      return responseUtil.success(reply, 'Verified', result);
    } catch (error: any) {
      return responseUtil.error(reply, error.message || 'Verify failed', 400);
    }
  };

  public submit = async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { slugOrToken } = request.params as { slugOrToken: string };
      const parts = request.parts();
      const fields: Record<string, string> = {};
      const files: Array<{
        requirementId: string;
        originalFilename: string;
        mimeType: string;
        buffer: Buffer;
      }> = [];

      for await (const part of parts) {
        if (part.type === 'file') {
          const buffer = await part.toBuffer();
          let requirementId = part.fieldname;
          if (requirementId.startsWith('file__')) {
            requirementId = requirementId.slice('file__'.length);
          }
          files.push({
            requirementId,
            originalFilename: part.filename || 'upload.bin',
            mimeType: part.mimetype || 'application/octet-stream',
            buffer,
          });
        } else {
          fields[part.fieldname] = String(part.value ?? '');
        }
      }

      // Prefer explicit requirementId fields: file__{requirementId}
      const normalized = files.map((f) => {
        if (f.requirementId.startsWith('file__')) {
          return {
            ...f,
            requirementId: f.requirementId.slice('file__'.length),
          };
        }
        return f;
      });

      // Also accept JSON map of requirement ids via field fileMap
      if (fields.fileRequirements) {
        try {
          const map = JSON.parse(fields.fileRequirements) as string[];
          for (let i = 0; i < normalized.length && i < map.length; i++) {
            normalized[i].requirementId = map[i];
          }
        } catch {
          // ignore
        }
      }

      const result = await requestLinkService.submit({
        slugOrToken,
        name: fields.name,
        email: fields.email,
        mobile: fields.mobile,
        emailProofToken: fields.emailProofToken,
        mobileProofToken: fields.mobileProofToken,
        consentPrivacy:
          fields.consentPrivacy === 'true' || fields.consentPrivacy === '1',
        consentTerms:
          fields.consentTerms === 'true' || fields.consentTerms === '1',
        consentDpa: fields.consentDpa === 'true' || fields.consentDpa === '1',
        files: normalized,
      });

      return responseUtil.success(reply, 'Documents submitted', result, 201);
    } catch (error: any) {
      return responseUtil.error(reply, error.message || 'Submit failed', 400);
    }
  };

  public listDomains = async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = (request as any).user;
      const { organisationId } = request.params as { organisationId: string };
      const result = await requestLinkService.listCollectDomains(
        user.userId,
        organisationId
      );
      return responseUtil.success(reply, 'Collect domains', result);
    } catch (error: any) {
      return responseUtil.error(reply, error.message || 'Failed', 400);
    }
  };

  public addDomain = async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = (request as any).user;
      const { organisationId } = request.params as { organisationId: string };
      const body = request.body as { hostname: string };
      const result = await requestLinkService.addCollectDomain({
        userId: user.userId,
        organisationId,
        hostname: body.hostname,
      });
      return responseUtil.success(reply, 'Domain added', result, 201);
    } catch (error: any) {
      return responseUtil.error(reply, error.message || 'Failed', 400);
    }
  };

  public verifyDomain = async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = (request as any).user;
      const { organisationId } = request.params as { organisationId: string };
      const body = request.body as { hostname: string };
      const result = await requestLinkService.verifyCollectDomain({
        userId: user.userId,
        organisationId,
        hostname: body.hostname,
      });
      return responseUtil.success(reply, 'Domain verified', result);
    } catch (error: any) {
      return responseUtil.error(reply, error.message || 'Failed', 400);
    }
  };

  public resolveHost = async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const host =
        (request.query as any)?.host ||
        (request.headers['x-forwarded-host'] as string) ||
        request.hostname;
      const result = await requestLinkService.resolveOrgByCollectHost(
        String(host).split(',')[0].trim()
      );
      return responseUtil.success(reply, 'Host resolved', result);
    } catch (error: any) {
      return responseUtil.error(reply, error.message || 'Failed', 400);
    }
  };
}

export default new RequestLinkController();
