import { randomUUID } from 'crypto';
import ChatConversation from '../model/chatConversation.model';
import ChatMessage, { ChatCitation, ChatStep } from '../model/chatMessage.model';

/**
 * Server-side chat history. Every query is scoped by BOTH organisationId and
 * userId, so another user's or another organisation's conversation is simply
 * "not found".
 */
export class ConversationNotFoundError extends Error {
  constructor() {
    super('Conversation not found');
    this.name = 'ConversationNotFoundError';
  }
}

export interface ChatScope {
  organisationId: string;
  userId: string;
}

export interface HistoryTurn {
  role: 'user' | 'assistant';
  content: string;
}

const MAX_TITLE = 120;
const HISTORY_CONTENT_CHARS = 8000;

function titleFrom(message: string): string {
  const flat = message.replace(/\s+/g, ' ').trim();
  return flat.length > 80 ? `${flat.slice(0, 77)}...` : flat || 'New conversation';
}

function publicConversation(doc: any) {
  return {
    conversationId: doc.conversationId,
    title: doc.title,
    projectId: doc.projectId ?? null,
    messageCount: doc.messageCount ?? 0,
    lastMessageAt: doc.lastMessageAt,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

function publicMessage(doc: any) {
  return {
    messageId: doc.messageId,
    role: doc.role,
    content: doc.content,
    citations: doc.citations ?? [],
    steps: doc.steps ?? [],
    mode: doc.mode ?? null,
    createdAt: doc.createdAt,
  };
}

export class ChatConversationService {
  private scopeFilter(scope: ChatScope) {
    if (!scope.organisationId || !scope.userId) {
      throw new Error('Organisation context required');
    }
    return { organisationId: scope.organisationId, userId: scope.userId };
  }

  public async list(scope: ChatScope, options: { limit?: number; before?: string } = {}) {
    const limit = Math.min(100, Math.max(1, Math.floor(options.limit ?? 30)));
    const filter: Record<string, unknown> = { ...this.scopeFilter(scope), deletedAt: null };
    if (options.before) {
      const before = new Date(options.before);
      if (!Number.isNaN(before.getTime())) filter.lastMessageAt = { $lt: before };
    }
    const rows = await ChatConversation.find(filter).sort({ lastMessageAt: -1 }).limit(limit).lean();
    return rows.map(publicConversation);
  }

  private async findOwned(scope: ChatScope, conversationId: string) {
    if (typeof conversationId !== 'string' || !conversationId) throw new ConversationNotFoundError();
    const doc = await ChatConversation.findOne({
      ...this.scopeFilter(scope),
      conversationId,
      deletedAt: null,
    });
    if (!doc) throw new ConversationNotFoundError();
    return doc;
  }

  public async get(scope: ChatScope, conversationId: string) {
    const conversation = await this.findOwned(scope, conversationId);
    const messages = await ChatMessage.find({ ...this.scopeFilter(scope), conversationId })
      .sort({ createdAt: 1 })
      .lean();
    return { ...publicConversation(conversation.toObject()), messages: messages.map(publicMessage) };
  }

  public async rename(scope: ChatScope, conversationId: string, title: string) {
    const clean = String(title ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_TITLE);
    if (!clean) throw new Error('title is required');
    const conversation = await this.findOwned(scope, conversationId);
    conversation.title = clean;
    await conversation.save();
    return publicConversation(conversation.toObject());
  }

  /** Soft-deletes the conversation and removes its messages. */
  public async remove(scope: ChatScope, conversationId: string) {
    const conversation = await this.findOwned(scope, conversationId);
    conversation.deletedAt = new Date();
    await conversation.save();
    await ChatMessage.deleteMany({ ...this.scopeFilter(scope), conversationId });
    return { conversationId, deleted: true };
  }

  /** Returns the caller's conversation, or creates one when no id is given. */
  public async open(scope: ChatScope, options: { conversationId?: string | null; message: string; projectId?: string | null }) {
    if (options.conversationId) {
      return this.findOwned(scope, options.conversationId);
    }
    return ChatConversation.create({
      conversationId: `conv_${randomUUID()}`,
      ...this.scopeFilter(scope),
      projectId: options.projectId || null,
      title: titleFrom(options.message),
      messageCount: 0,
      lastMessageAt: new Date(),
    });
  }

  /** Last `turns` user/assistant pairs, oldest first, for the model's context. */
  public async history(scope: ChatScope, conversationId: string, turns = 10): Promise<HistoryTurn[]> {
    const rows = await ChatMessage.find({ ...this.scopeFilter(scope), conversationId })
      .sort({ createdAt: -1 })
      .limit(turns * 2)
      .lean();
    return rows
      .reverse()
      .filter((m: any) => m.content && m.mode !== 'error' && m.mode !== 'aborted')
      .map((m: any) => ({ role: m.role, content: String(m.content).slice(0, HISTORY_CONTENT_CHARS) }));
  }

  public async append(
    scope: ChatScope,
    conversationId: string,
    message: {
      role: 'user' | 'assistant';
      content: string;
      citations?: ChatCitation[];
      steps?: ChatStep[];
      mode?: string | null;
      usage?: Record<string, number> | null;
      latencyMs?: number | null;
    }
  ) {
    const doc = await ChatMessage.create({
      messageId: `msg_${randomUUID()}`,
      conversationId,
      ...this.scopeFilter(scope),
      role: message.role,
      content: message.content,
      citations: message.citations ?? [],
      steps: message.steps ?? [],
      mode: message.mode ?? null,
      usage: message.usage ?? null,
      latencyMs: message.latencyMs ?? null,
    });
    await ChatConversation.updateOne(
      { ...this.scopeFilter(scope), conversationId },
      { $inc: { messageCount: 1 }, $set: { lastMessageAt: new Date() } }
    );
    return publicMessage(doc.toObject());
  }
}

export default new ChatConversationService();
