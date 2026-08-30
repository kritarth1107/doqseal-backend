import { FastifyRequest, FastifyReply } from 'fastify';
import chatService from '../service/chat.service';
import responseUtil from '../utils/response.util';
import { resolveOrganisationId } from '../utils/org-access.util';

export class ChatController {
  public async send(request: FastifyRequest, reply: FastifyReply) {
    const sessionUser = (request as any).user;
    const body = request.body as {
      message?: string;
      projectId?: string;
      organisationId?: string;
    };

    try {
      const message = body?.message?.trim();
      if (!message) {
        return responseUtil.error(reply, 'message is required', 400);
      }

      const organisationId = resolveOrganisationId(request, body.organisationId);
      const result = await chatService.sendMessage(sessionUser.userId, {
        message,
        organisationId,
        projectId: body.projectId,
      });

      return responseUtil.success(reply, 'Chat response generated', result);
    } catch (error: any) {
      const message = error.message || 'Failed to process chat request';
      const status = /quota|exceeded/i.test(message)
        ? 429
        : message.includes('Organisation context required') ||
            message.includes('access')
          ? 400
          : 500;
      return responseUtil.error(reply, message, status);
    }
  }
}

export default new ChatController();
