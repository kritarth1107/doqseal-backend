import { FastifyRequest, FastifyReply } from 'fastify';
import { randomUUID } from 'crypto';
import config from '../config/app.config';
import chatService from '../service/chat.service';
import chatConversationService, {
  ChatScope,
  ConversationNotFoundError,
} from '../service/chatConversation.service';
import { formatSse, proxyChatStream, StreamSummary } from '../service/chatStream.service';
import auditService from '../service/audit.service';
import quotaService from '../service/quota.service';
import responseUtil from '../utils/response.util';
import { aiEngineSecret, mintAiEngineToken } from '../utils/aiEngineToken.util';
import {
  assertUserInOrganisation,
  resolveOrganisationId,
} from '../utils/org-access.util';

const HEARTBEAT_MS = 15_000;
const HISTORY_TURNS = 10;

function accessStatus(message: string): number {
  if (/quota|exceeded|not included/i.test(message)) return 429;
  if (/not found/i.test(message)) return 404;
  if (/access|requires .* role/i.test(message)) return 403;
  if (/Organisation context required|required/i.test(message)) return 400;
  return 500;
}

/** Organisation from the x-organisation-id header (session context) plus a membership check. */
async function chatScope(request: FastifyRequest): Promise<ChatScope> {
  const sessionUser = (request as any).user;
  const organisationId = resolveOrganisationId(request, (request.body as any)?.organisationId);
  await assertUserInOrganisation(sessionUser.userId, organisationId);
  return { organisationId, userId: sessionUser.userId };
}

function assistantMode(summary: StreamSummary): string {
  if (summary.aborted) return 'aborted';
  if (summary.error) return 'error';
  if (summary.decline) return 'declined';
  return summary.completed?.mode || 'answered';
}

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

  /** POST /chat/stream — grounded answer streamed as server-sent events. */
  public async stream(request: FastifyRequest, reply: FastifyReply) {
    const body = (request.body || {}) as {
      message?: string;
      conversationId?: string;
      projectId?: string;
    };
    const message = body.message?.trim();
    if (!message) {
      return responseUtil.error(reply, 'message is required', 400);
    }
    // Without the shared secret the ai-engine cannot verify us; 404 tells the
    // dashboard to use the non-streaming endpoint instead.
    if (!aiEngineSecret()) {
      return responseUtil.error(reply, 'Streaming chat is not enabled', 404);
    }

    let scope: ChatScope;
    let conversation: any;
    let history;
    try {
      scope = await chatScope(request);
      const plan = await quotaService.getPlanLimits(scope.organisationId);
      if (plan.dailyApiRequestLimit !== 0) {
        await quotaService.trackApiRequest(scope.organisationId);
      }
      conversation = await chatConversationService.open(scope, {
        conversationId: body.conversationId,
        message,
        projectId: body.projectId,
      });
      history = await chatConversationService.history(scope, conversation.conversationId, HISTORY_TURNS);
      await chatConversationService.append(scope, conversation.conversationId, { role: 'user', content: message });
    } catch (error: any) {
      if (error instanceof ConversationNotFoundError) {
        return responseUtil.error(reply, error.message, 404);
      }
      const text = error?.message || 'Failed to start chat';
      return responseUtil.error(reply, text, accessStatus(text));
    }

    const conversationId: string = conversation.conversationId;
    const projectId = body.projectId || conversation.projectId || null;
    const token = mintAiEngineToken({
      organisationId: scope.organisationId,
      userId: scope.userId,
      projectId,
      scope: 'chat',
      ttlSeconds: 300,
    });

    reply.hijack();
    const raw = reply.raw;
    // Keep headers set by earlier hooks (CORS, security headers).
    const inherited: Record<string, string | number | string[]> = {};
    for (const [name, value] of Object.entries(reply.getHeaders())) {
      if (value !== undefined) inherited[name] = value as string | number | string[];
    }
    raw.writeHead(200, {
      ...inherited,
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no',
      'X-Conversation-Id': conversationId,
      Connection: 'keep-alive',
    });
    raw.flushHeaders?.();

    const clientGone = new AbortController();
    const onClose = () => {
      if (!raw.writableEnded) clientGone.abort();
    };
    raw.on('close', onClose);
    const write = (chunk: string) => {
      if (!raw.writableEnded && !raw.destroyed) raw.write(chunk);
    };
    const heartbeat = setInterval(() => write(': ping\n\n'), HEARTBEAT_MS);

    const runId = `run_${randomUUID()}`;
    write(formatSse('run.started', { runId, conversationId }));

    let summary: StreamSummary;
    try {
      summary = await proxyChatStream({
        url: `${config.aiEngine.url.replace(/\/$/, '')}/v1/chat/stream`,
        token,
        body: {
          message,
          history,
          projectId,
          conversationId,
          organisationId: scope.organisationId,
        },
        write,
        signal: clientGone.signal,
      });
    } finally {
      clearInterval(heartbeat);
      raw.off('close', onClose);
    }

    const mode = assistantMode(summary);
    const content = summary.decline?.message || summary.tokens || summary.error?.message || '';
    try {
      await chatConversationService.append(scope, conversationId, {
        role: 'assistant',
        content,
        citations: mode === 'declined' || mode === 'error' ? [] : summary.citations,
        steps: summary.steps,
        mode,
        usage: summary.completed?.usage ?? null,
        latencyMs: summary.completed?.latencyMs ?? null,
      });
      await auditService.logEvent({
        actorId: scope.userId,
        organisationId: scope.organisationId,
        action: 'chat.query',
        resourceType: 'project',
        resourceId: projectId || scope.organisationId,
        metadata: {
          mode,
          streamed: true,
          declined: mode === 'declined',
          declineReason: summary.decline?.reason ?? null,
          errorCode: summary.error?.code ?? null,
          citationCount: summary.citations.length,
          conversationId,
        },
      });
    } catch (err: any) {
      console.error('Failed to record chat turn:', err?.message || err);
    } finally {
      // Ended after the turn is stored so a client can reload the conversation right away.
      if (!raw.writableEnded) raw.end();
    }
  }

  public async listConversations(request: FastifyRequest, reply: FastifyReply) {
    const query = (request.query || {}) as { limit?: string; before?: string };
    try {
      const scope = await chatScope(request);
      const conversations = await chatConversationService.list(scope, {
        limit: query.limit ? Number(query.limit) : undefined,
        before: query.before,
      });
      return responseUtil.success(reply, 'Conversations', { conversations });
    } catch (error: any) {
      const text = error?.message || 'Failed to list conversations';
      return responseUtil.error(reply, text, accessStatus(text));
    }
  }

  public async getConversation(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    try {
      const scope = await chatScope(request);
      const conversation = await chatConversationService.get(scope, id);
      return responseUtil.success(reply, 'Conversation', conversation);
    } catch (error: any) {
      const text = error?.message || 'Failed to load conversation';
      return responseUtil.error(reply, text, error instanceof ConversationNotFoundError ? 404 : accessStatus(text));
    }
  }

  public async renameConversation(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    const { title } = (request.body || {}) as { title?: string };
    try {
      const scope = await chatScope(request);
      const conversation = await chatConversationService.rename(scope, id, title ?? '');
      return responseUtil.success(reply, 'Conversation renamed', conversation);
    } catch (error: any) {
      const text = error?.message || 'Failed to rename conversation';
      return responseUtil.error(reply, text, error instanceof ConversationNotFoundError ? 404 : accessStatus(text));
    }
  }

  public async deleteConversation(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    try {
      const scope = await chatScope(request);
      const result = await chatConversationService.remove(scope, id);
      return responseUtil.success(reply, 'Conversation deleted', result);
    } catch (error: any) {
      const text = error?.message || 'Failed to delete conversation';
      return responseUtil.error(reply, text, error instanceof ConversationNotFoundError ? 404 : accessStatus(text));
    }
  }
}

export default new ChatController();
