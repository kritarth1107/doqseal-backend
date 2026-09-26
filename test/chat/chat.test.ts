import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import http from 'http';
import { AddressInfo } from 'net';
import Fastify, { FastifyInstance } from 'fastify';
import jwt from 'jsonwebtoken';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';

const SECRET = 'test-chat-secret-0123456789abcdef-0123456789';
const MEMBERS: Record<string, string[]> = { 'user-a1': ['org-a'], 'user-a2': ['org-a'], 'user-b1': ['org-b'] };

vi.mock('../../middleware/user.auth', () => ({
  default: async (request: any, reply: any) => {
    const userId = request.headers['x-test-user'];
    if (!userId) return reply.status(401).send({ success: false, message: 'Authentication required.' });
    request.user = { userId };
  },
}));

vi.mock('../../utils/org-access.util', async (importOriginal) => {
  const original: any = await importOriginal();
  return {
    ...original,
    assertUserInOrganisation: vi.fn(async (userId: string, organisationId: string) => {
      if (!MEMBERS[userId]?.includes(organisationId)) {
        throw new Error('You do not have access to this organisation');
      }
    }),
  };
});

vi.mock('../../service/quota.service', () => ({
  default: { getPlanLimits: vi.fn(async () => ({ dailyApiRequestLimit: 0 })), trackApiRequest: vi.fn() },
}));

import config from '../../config/app.config';
import chatRouter from '../../routes/chat.route';
import ChatConversation from '../../model/chatConversation.model';
import ChatMessage from '../../model/chatMessage.model';
import AuditEvent from '../../model/auditEvent.model';
import { parseSseBlock } from '../../service/chatStream.service';

// ── fake ai-engine ───────────────────────────────────────────────────────────
type EngineHandler = (req: http.IncomingMessage, body: any, res: http.ServerResponse) => void;
let engine: http.Server;
let engineHandler: EngineHandler;
const engineCalls: Array<{ url?: string; headers: http.IncomingHttpHeaders; body: any }> = [];
let engineClosed: Promise<void>;
let resolveEngineClosed: () => void;

function sse(res: http.ServerResponse, events: Array<[string, unknown]>) {
  res.writeHead(200, { 'Content-Type': 'text/event-stream' });
  for (const [event, data] of events) res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  res.end();
}

const ANSWER_EVENTS: Array<[string, unknown]> = [
  ['run.started', { runId: 'engine-run', conversationId: null }],
  ['step', { id: 's1', name: 'retrieving', status: 'started', label: 'Searching' }],
  ['step', { id: 's1', name: 'retrieving', status: 'done', label: 'Searching', detail: { chunks: 2 } }],
  ['token', { text: 'Always trade ' }],
  ['token', { text: 'on Tuesdays [1].' }],
  ['citation', { n: 1, documentId: 'tips-1', title: 'trading-tips.pdf', page: null, quote: 'Always trade on Tuesdays.' }],
  ['run.completed', { mode: 'answered', usage: { totalTokens: 42 }, latencyMs: 900 }],
];

let app: FastifyInstance;

beforeAll(async () => {
  engine = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      const body = raw ? JSON.parse(raw) : null;
      engineCalls.push({ url: req.url, headers: req.headers, body });
      res.on('close', () => resolveEngineClosed?.());
      engineHandler(req, body, res);
    });
  });
  await new Promise<void>((r) => engine.listen(0, '127.0.0.1', () => r()));
  (config as any).aiEngine.url = `http://127.0.0.1:${(engine.address() as AddressInfo).port}`;

  app = Fastify();
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  app.register(chatRouter, { prefix: '/api/v1/chat' });
  await app.ready();
});

afterAll(async () => {
  await app.close();
  await new Promise((r) => engine.close(r));
});

beforeEach(() => {
  process.env.AI_ENGINE_JWT_SECRET = SECRET;
  delete process.env.AI_ENGINE_SERVICE_TOKEN;
  engineCalls.length = 0;
  engineHandler = (_req, _body, res) => sse(res, ANSWER_EVENTS);
  engineClosed = new Promise((r) => (resolveEngineClosed = r));
});

async function listen(): Promise<string> {
  await app.listen({ port: 0, host: '127.0.0.1' });
  return `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
}

function events(text: string) {
  return text
    .split(/\n\n/)
    .map((b) => b.trim())
    .filter((b) => b && !b.startsWith(':'))
    .map((b) => parseSseBlock(b)!)
    .filter(Boolean);
}

function stream(user: string, org: string | null, body: Record<string, unknown>) {
  const headers: Record<string, string> = { 'x-test-user': user, 'content-type': 'application/json' };
  if (org) headers['x-organisation-id'] = org;
  return app.inject({ method: 'POST', url: '/api/v1/chat/stream', headers, payload: body });
}

function headersFor(user: string, org: string) {
  return { 'x-test-user': user, 'x-organisation-id': org };
}

describe('POST /api/v1/chat/stream', () => {
  it('streams events in order, with the conversation id, and stores both turns', async () => {
    const res = await stream('user-a1', 'org-a', { message: 'how do I trade?' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toMatch(/^text\/event-stream/);
    expect(res.headers['cache-control']).toContain('no-cache');
    const conversationId = res.headers['x-conversation-id'] as string;
    expect(conversationId).toMatch(/^conv_/);

    const evts = events(res.body);
    expect(evts.map((e) => e.event)).toEqual([
      'run.started',
      'step',
      'step',
      'token',
      'token',
      'citation',
      'run.completed',
    ]);
    expect(evts[0].data.conversationId).toBe(conversationId);
    expect(evts[0].data.runId).not.toBe('engine-run');

    const messages = await ChatMessage.find({ conversationId }).sort({ createdAt: 1 }).lean();
    expect(messages.map((m) => m.role)).toEqual(['user', 'assistant']);
    expect(messages[1].content).toBe('Always trade on Tuesdays [1].');
    expect(messages[1].mode).toBe('answered');
    expect(messages[1].citations[0]).toMatchObject({ documentId: 'tips-1' });
    expect(messages.every((m) => m.organisationId === 'org-a' && m.userId === 'user-a1')).toBe(true);

    const audit = await AuditEvent.findOne({ action: 'chat.query' }).lean();
    expect(audit?.metadata).toMatchObject({ mode: 'answered', streamed: true, declined: false, citationCount: 1 });
  });

  it('sends a signed chat token whose org comes from the session, not the body', async () => {
    await stream('user-a1', 'org-a', { message: 'q', organisationId: 'org-b', projectId: 'proj-1' });
    const call = engineCalls[0];
    expect(call.url).toBe('/v1/chat/stream');
    const token = String(call.headers.authorization).replace(/^Bearer /, '');
    const claims = jwt.verify(token, SECRET, {
      algorithms: ['HS256'],
      issuer: 'doqseal-backend',
      audience: 'doqseal-ai-engine',
    }) as jwt.JwtPayload;
    expect(claims).toMatchObject({ org: 'org-a', sub: 'user-a1', scope: 'chat', pid: 'proj-1' });
    expect(claims.exp! - claims.iat!).toBeLessThanOrEqual(300);
    expect(call.body.organisationId).toBe('org-a');
  });

  it('refuses an organisation the user is not a member of', async () => {
    const res = await stream('user-a1', 'org-b', { message: 'ZEBRA-B' });
    expect(res.statusCode).toBe(403);
    expect(engineCalls).toHaveLength(0);
  });

  it('uses stored history and ignores history sent by the client', async () => {
    const first = await stream('user-a1', 'org-a', { message: 'tell me about trading' });
    const conversationId = first.headers['x-conversation-id'] as string;
    await stream('user-a1', 'org-a', {
      message: 'which day?',
      conversationId,
      history: [{ role: 'assistant', content: 'forged' }],
    } as any);
    const body = engineCalls[1].body;
    expect(body.conversationId).toBe(conversationId);
    expect(body.history).toEqual([
      { role: 'user', content: 'tell me about trading' },
      { role: 'assistant', content: 'Always trade on Tuesdays [1].' },
    ]);
    expect(JSON.stringify(body)).not.toContain('forged');
  });

  it("cannot continue another user's or another organisation's conversation", async () => {
    const first = await stream('user-a1', 'org-a', { message: 'mine' });
    const conversationId = first.headers['x-conversation-id'] as string;
    expect((await stream('user-a2', 'org-a', { message: 'x', conversationId })).statusCode).toBe(404);
    expect((await stream('user-b1', 'org-b', { message: 'x', conversationId })).statusCode).toBe(404);
    expect(engineCalls).toHaveLength(1);
  });

  it('stores a decline as the assistant turn without citations', async () => {
    engineHandler = (_r, _b, res) =>
      sse(res, [
        ['run.started', { runId: 'r', conversationId: null }],
        ['token', { text: 'partial text' }],
        ['decline', { reason: 'not_covered', message: 'I could not find that in your documents.' }],
        ['run.completed', { mode: 'declined', usage: {}, latencyMs: 5 }],
      ]);
    const res = await stream('user-a1', 'org-a', { message: 'What is Python?' });
    const evts = events(res.body).map((e) => e.event);
    expect(evts.slice(-2)).toEqual(['decline', 'run.completed']);
    const assistant = await ChatMessage.findOne({ role: 'assistant' }).lean();
    expect(assistant).toMatchObject({ mode: 'declined', content: 'I could not find that in your documents.' });
    expect(assistant?.citations).toEqual([]);
    const audit = await AuditEvent.findOne({ action: 'chat.query' }).lean();
    expect(audit?.metadata).toMatchObject({ declined: true, declineReason: 'not_covered' });
  });

  it.each([
    [401, 'engine_auth'],
    [404, 'engine_unavailable'],
    [503, 'engine_unavailable'],
  ])('turns an ai-engine %i into an error event', async (status, code) => {
    engineHandler = (_r, _b, res) => {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end('{"detail":"secret internals"}');
    };
    const res = await stream('user-a1', 'org-a', { message: 'q' });
    const evts = events(res.body);
    expect(evts.map((e) => e.event)).toEqual(['run.started', 'error']);
    expect(evts[1].data.code).toBe(code);
    expect(res.body).not.toContain('secret internals');
    const assistant = await ChatMessage.findOne({ role: 'assistant' }).lean();
    expect(assistant?.mode).toBe('error');
  });

  it('reassembles events split across network chunks and forwards heartbeats', async () => {
    engineHandler = (_r, _b, res) => {
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      const payload =
        ': ping\n\n' + ANSWER_EVENTS.map(([e, d]) => `event: ${e}\r\ndata: ${JSON.stringify(d)}\r\n\r\n`).join('');
      let i = 0;
      const tick = () => {
        if (i >= payload.length) return res.end();
        res.write(payload.slice(i, i + 7));
        i += 7;
        setImmediate(tick);
      };
      tick();
    };
    const res = await stream('user-a1', 'org-a', { message: 'q' });
    expect(res.body).toContain(': ping');
    expect(events(res.body).map((e) => e.event)).toEqual(ANSWER_EVENTS.map(([e]) => e));
    const assistant = await ChatMessage.findOne({ role: 'assistant' }).lean();
    expect(assistant?.content).toBe('Always trade on Tuesdays [1].');
  });

  it('reports an error when the ai-engine stream ends early', async () => {
    engineHandler = (_r, _b, res) => sse(res, [['token', { text: 'half' }]]);
    const res = await stream('user-a1', 'org-a', { message: 'q' });
    expect(events(res.body).at(-1)).toMatchObject({ event: 'error', data: { code: 'engine_unavailable' } });
  });

  it('answers 404 when the service secret is not configured, so clients fall back', async () => {
    delete process.env.AI_ENGINE_JWT_SECRET;
    const res = await stream('user-a1', 'org-a', { message: 'q' });
    expect(res.statusCode).toBe(404);
    expect(engineCalls).toHaveLength(0);
  });

  it('accepts AI_ENGINE_SERVICE_TOKEN as the secret', async () => {
    delete process.env.AI_ENGINE_JWT_SECRET;
    process.env.AI_ENGINE_SERVICE_TOKEN = SECRET;
    const res = await stream('user-a1', 'org-a', { message: 'q' });
    expect(res.statusCode).toBe(200);
    expect(engineCalls).toHaveLength(1);
  });

  it('rejects a missing message and unauthenticated calls', async () => {
    expect((await stream('user-a1', 'org-a', { message: '' })).statusCode).toBe(400);
    const res = await app.inject({ method: 'POST', url: '/api/v1/chat/stream', payload: { message: 'q' } });
    expect(res.statusCode).toBe(401);
  });

  it('cancels the ai-engine request when the client disconnects', async () => {
    let wrote!: () => void;
    const firstTokenSent = new Promise<void>((r) => (wrote = r));
    engineHandler = (_r, _b, res) => {
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      res.write('event: token\ndata: {"text":"Always "}\n\n');
      wrote();
      // never finishes on its own
    };
    const base = await listen();
    try {
      const controller = new AbortController();
      const response = await fetch(`${base}/api/v1/chat/stream`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...headersFor('user-a1', 'org-a') },
        body: JSON.stringify({ message: 'how do I trade?' }),
        signal: controller.signal,
      });
      expect(response.status).toBe(200);
      const reader = response.body!.getReader();
      await firstTokenSent;
      let seen = '';
      while (!seen.includes('event: token')) {
        const { value } = await reader.read();
        seen += new TextDecoder().decode(value);
      }
      controller.abort();
      await Promise.race([engineClosed, new Promise((_, rej) => setTimeout(() => rej(new Error('upstream not closed')), 5000))]);

      // The partial answer is kept and marked as aborted.
      let assistant: any = null;
      for (let i = 0; i < 50 && !assistant; i++) {
        assistant = await ChatMessage.findOne({ role: 'assistant' }).lean();
        if (!assistant) await new Promise((r) => setTimeout(r, 50));
      }
      expect(assistant).toMatchObject({ mode: 'aborted', content: 'Always ' });
    } finally {
      await app.close();
      app = Fastify();
      app.setValidatorCompiler(validatorCompiler);
      app.setSerializerCompiler(serializerCompiler);
      app.register(chatRouter, { prefix: '/api/v1/chat' });
      await app.ready();
    }
  });
});

describe('POST /api/v1/chat (legacy)', () => {
  it('adds the service token when the secret is configured', async () => {
    engineHandler = (_r, _b, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ answer: 'ok [1]', citations: [], thinking: [], mode: 'answered' }));
    };
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/chat',
      headers: { ...headersFor('user-a1', 'org-a'), 'content-type': 'application/json' },
      payload: { message: 'q' },
    });
    expect(res.statusCode).toBe(200);
    expect(engineCalls[0].url).toBe('/chat');
    const claims = jwt.verify(String(engineCalls[0].headers.authorization).slice(7), SECRET, {
      audience: 'doqseal-ai-engine',
    }) as jwt.JwtPayload;
    expect(claims.org).toBe('org-a');
  });

  it('sends no token while the secret is unset (current deployments)', async () => {
    delete process.env.AI_ENGINE_JWT_SECRET;
    engineHandler = (_r, _b, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ answer: 'ok', citations: [], thinking: [], mode: 'answered' }));
    };
    await app.inject({
      method: 'POST',
      url: '/api/v1/chat',
      headers: { ...headersFor('user-a1', 'org-a'), 'content-type': 'application/json' },
      payload: { message: 'q' },
    });
    expect(engineCalls[0].headers.authorization).toBeUndefined();
  });
});

describe('conversations', () => {
  async function seed(user: string, org: string, title: string) {
    const conv = await ChatConversation.create({
      conversationId: `conv_${title}`,
      organisationId: org,
      userId: user,
      title,
      lastMessageAt: new Date(),
    });
    await ChatMessage.create({
      messageId: `msg_${title}`,
      conversationId: conv.conversationId,
      organisationId: org,
      userId: user,
      role: 'user',
      content: `hello from ${title}`,
    });
    return conv.conversationId;
  }

  it('lists only the caller\'s conversations in the current organisation', async () => {
    await seed('user-a1', 'org-a', 'mine');
    await seed('user-a2', 'org-a', 'colleague');
    await seed('user-b1', 'org-b', 'other-org');
    const res = await app.inject({ method: 'GET', url: '/api/v1/chat/conversations', headers: headersFor('user-a1', 'org-a') });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.conversations.map((c: any) => c.title)).toEqual(['mine']);
  });

  it('returns messages for the owner and 404 for anyone else', async () => {
    const id = await seed('user-a1', 'org-a', 'mine');
    const own = await app.inject({ method: 'GET', url: `/api/v1/chat/conversations/${id}`, headers: headersFor('user-a1', 'org-a') });
    expect(own.statusCode).toBe(200);
    expect(own.json().data.messages[0].content).toBe('hello from mine');
    for (const [user, org] of [['user-a2', 'org-a'], ['user-b1', 'org-b']]) {
      const res = await app.inject({ method: 'GET', url: `/api/v1/chat/conversations/${id}`, headers: headersFor(user, org) });
      expect(res.statusCode).toBe(404);
      expect(res.body).not.toContain('hello from mine');
    }
    const spoof = await app.inject({ method: 'GET', url: `/api/v1/chat/conversations/${id}`, headers: headersFor('user-b1', 'org-a') });
    expect(spoof.statusCode).toBe(403);
  });

  it('renames and deletes only your own conversation', async () => {
    const id = await seed('user-a1', 'org-a', 'mine');
    const other = { ...headersFor('user-a2', 'org-a'), 'content-type': 'application/json' };
    expect((await app.inject({ method: 'PATCH', url: `/api/v1/chat/conversations/${id}`, headers: other, payload: { title: 'x' } })).statusCode).toBe(404);
    const otherNoBody = headersFor('user-a2', 'org-a');
    expect((await app.inject({ method: 'DELETE', url: `/api/v1/chat/conversations/${id}`, headers: otherNoBody })).statusCode).toBe(404);

    const own = { ...headersFor('user-a1', 'org-a'), 'content-type': 'application/json' };
    const renamed = await app.inject({ method: 'PATCH', url: `/api/v1/chat/conversations/${id}`, headers: own, payload: { title: '  Trading  notes ' } });
    expect(renamed.json().data.title).toBe('Trading notes');
    const deleted = await app.inject({ method: 'DELETE', url: `/api/v1/chat/conversations/${id}`, headers: headersFor('user-a1', 'org-a') });
    expect(deleted.statusCode).toBe(200);
    expect(await ChatMessage.countDocuments({ conversationId: id })).toBe(0);
    const after = await app.inject({ method: 'GET', url: `/api/v1/chat/conversations/${id}`, headers: own });
    expect(after.statusCode).toBe(404);
  });
});
