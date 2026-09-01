import { FastifyRequest, FastifyReply } from 'fastify';
import { getPublicMedia } from '../utils/blob-storage.util';
import profileMediaService from '../service/profileMedia.service';
import responseUtil from '../utils/response.util';

export class MediaController {
  public getProfileMedia = async (request: FastifyRequest, reply: FastifyReply) => {
    const sessionUser = (request as any).user;
    const params = request.params as { '*': string };
    const objectKey = decodeURIComponent(params['*'] || '').replace(/^\/+/, '');

    if (!objectKey || !profileMediaService.isProfileObjectKey(objectKey)) {
      return responseUtil.error(reply, 'Invalid media path', 400);
    }

    try {
      const orgIds = Array.isArray(sessionUser.organisations)
        ? sessionUser.organisations.map(
            (o: { organisationId: string }) => o.organisationId
          )
        : [];

      await profileMediaService.assertCanReadProfileMedia({
        objectKey,
        userId: sessionUser.userId,
        organisationIds: orgIds,
      });

      const { buffer, contentType } = await getPublicMedia({
        storagePath: objectKey,
      });

      return reply
        .header('Content-Type', contentType)
        .header('Cache-Control', 'private, max-age=3600')
        .send(buffer);
    } catch (error: any) {
      const status = error.message?.includes('Access denied') ? 403 : 404;
      return responseUtil.error(
        reply,
        error.message || 'Media not found',
        status
      );
    }
  };
}

export default new MediaController();
