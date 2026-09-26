import axios from 'axios';
import type { Readable } from 'stream';
import type { ChatCitation, ChatStep } from '../model/chatMessage.model';
import type { HistoryTurn } from './chatConversation.service';

/**
 * Proxies the ai-engine's grounded chat stream (text/event-stream) to a client,
 * one event per write so nothing waits in a buffer, and collects what is needed
 * to store the assistant turn afterwards.
 */
export interface SseEvent {
  event: string;
  data: any;
}

export interface StreamSummary {
  tokens: string;
  citations: ChatCitation[];
  steps: ChatStep[];
  decline: { reason: string; message: string } | null;
  completed: { mode?: string; usage?: Record<string, number>; latencyMs?: number } | null;
  error: { code: string; message: string } | null;
  aborted: boolean;
}

export interface ProxyChatStreamOptions {
  url: string;
  token: string;
  body: {
    message: string;
    history: HistoryTurn[];
    projectId?: string | null;
    conversationId: string;
    organisationId: string;
  };
  /** Writes one chunk to the client. */
  write: (chunk: string) => void;
  signal: AbortSignal;
  idleTimeoutMs?: number;
}

const UNAVAILABLE = 'The assistant is unavailable right now. Please try again shortly.';

export function formatSse(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

/** Parses one SSE block (without the blank-line terminator). Comments return null. */
export function parseSseBlock(block: string): SseEvent | null {
  let event = 'message';
  const data: string[] = [];
  for (const line of block.split(/\r?\n/)) {
    if (!line || line.startsWith(':')) continue;
    const idx = line.indexOf(':');
    const field = idx === -1 ? line : line.slice(0, idx);
    const value = idx === -1 ? '' : line.slice(idx + 1).replace(/^ /, '');
    if (field === 'event') event = value;
    else if (field === 'data') data.push(value);
  }
  if (!data.length) return null;
  try {
    return { event, data: JSON.parse(data.join('\n')) };
  } catch {
    return null;
  }
}

function errorForStatus(status: number): { code: string; message: string } {
  if (status === 401 || status === 403) return { code: 'engine_auth', message: UNAVAILABLE };
  if (status === 404) return { code: 'engine_unavailable', message: UNAVAILABLE };
  if (status === 429) return { code: 'rate_limited', message: 'Too many requests. Please wait a moment and try again.' };
  return { code: 'engine_unavailable', message: UNAVAILABLE };
}

export async function proxyChatStream(options: ProxyChatStreamOptions): Promise<StreamSummary> {
  const summary: StreamSummary = {
    tokens: '',
    citations: [],
    steps: [],
    decline: null,
    completed: null,
    error: null,
    aborted: false,
  };
  const upstream = new AbortController();
  const onAbort = () => upstream.abort();
  if (options.signal.aborted) {
    summary.aborted = true;
    return summary;
  }
  options.signal.addEventListener('abort', onAbort, { once: true });

  const idleMs = options.idleTimeoutMs ?? 60_000;
  let timedOut = false;
  let idleTimer: NodeJS.Timeout | null = null;
  const touch = () => {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      timedOut = true;
      upstream.abort();
    }, idleMs);
  };

  const fail = (err: { code: string; message: string }) => {
    summary.error = err;
    options.write(formatSse('error', err));
  };

  const handle = (evt: SseEvent) => {
    const data = evt.data ?? {};
    switch (evt.event) {
      case 'run.started':
        return; // the backend already sent its own run.started with the conversation id
      case 'token':
        if (typeof data.text !== 'string') return;
        summary.tokens += data.text;
        break;
      case 'step':
        if (data.status === 'done') summary.steps.push(data);
        break;
      case 'citation':
        summary.citations.push(data);
        break;
      case 'decline':
        summary.decline = { reason: String(data.reason ?? 'not_covered'), message: String(data.message ?? '') };
        break;
      case 'run.completed':
        summary.completed = data;
        break;
      case 'error':
        summary.error = { code: String(data.code ?? 'engine_error'), message: String(data.message ?? UNAVAILABLE) };
        break;
      default:
        return; // unknown events are not forwarded
    }
    options.write(formatSse(evt.event, data));
  };

  try {
    touch();
    const response = await axios.post<Readable>(options.url, options.body, {
      responseType: 'stream',
      headers: {
        Authorization: `Bearer ${options.token}`,
        Accept: 'text/event-stream',
        'Content-Type': 'application/json',
      },
      signal: upstream.signal,
      validateStatus: () => true,
      decompress: false,
    });

    if (response.status !== 200) {
      response.data?.destroy?.();
      fail(errorForStatus(response.status));
      return summary;
    }

    let buffer = '';
    const stream = response.data;
    stream.setEncoding?.('utf8');
    for await (const chunk of stream) {
      touch();
      buffer += typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8');
      let match: RegExpExecArray | null;
      const boundary = /\r?\n\r?\n/;
      while ((match = boundary.exec(buffer))) {
        const block = buffer.slice(0, match.index);
        buffer = buffer.slice(match.index + match[0].length);
        if (block.split(/\r?\n/).every((l) => l.startsWith(':') || !l)) {
          options.write(': ping\n\n');
          continue;
        }
        const evt = parseSseBlock(block);
        if (evt) handle(evt);
      }
    }
    if (!summary.completed && !summary.error && !options.signal.aborted) {
      fail({ code: 'engine_unavailable', message: UNAVAILABLE });
    }
  } catch (err: any) {
    if (options.signal.aborted) {
      summary.aborted = true;
    } else if (timedOut) {
      fail({ code: 'engine_timeout', message: UNAVAILABLE });
    } else if (!summary.completed && !summary.error) {
      console.error('Chat stream proxy failure:', err?.code || err?.message || err);
      fail({ code: 'engine_unavailable', message: UNAVAILABLE });
    }
  } finally {
    if (idleTimer) clearTimeout(idleTimer);
    options.signal.removeEventListener('abort', onAbort);
    if (options.signal.aborted) summary.aborted = true;
  }
  return summary;
}
