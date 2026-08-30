import {
  isWebhookEvent,
  ProjectWebhook,
  WEBHOOK_EVENTS,
  WebhookEvent,
} from '../constants/webhook.events';

/**
 * Fire project webhooks for a selected event.
 * Failures are logged only — never fail the extraction / upload job.
 */
export type WebhookPayload = {
  event: WebhookEvent;
  projectId: string;
  documentId: string;
  jobId?: string | null;
  organisationId: string;
  status?: string | null;
  originalFilename?: string | null;
  displayTitle?: string | null;
  error?: string | null;
  extraction?: {
    data?: Record<string, unknown>;
    fieldConfidence?: Record<string, number>;
    strategy?: string | null;
    status?: string | null;
  };
  timestamp: string;
};

function isValidHttpUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

/** Normalize API / legacy shapes into ProjectWebhook[]. */
export function normalizeProjectWebhooks(input: unknown): ProjectWebhook[] {
  if (!Array.isArray(input)) return [];

  // Legacy: string[] of URLs → all events default to processed
  if (input.every((item) => typeof item === 'string')) {
    const urls = Array.from(
      new Set(
        (input as string[])
          .map((u) => u.trim())
          .filter(Boolean)
      )
    );
    for (const url of urls) {
      if (!isValidHttpUrl(url)) {
        throw new Error(`Invalid webhook URL: ${url}`);
      }
    }
    if (urls.length > 1) {
      throw new Error('Only one webhook URL is allowed per project');
    }
    return urls.slice(0, 1).map((url) => ({
      url,
      events: ['document.processed'] as WebhookEvent[],
      enabled: true,
    }));
  }

  const webhooks: ProjectWebhook[] = [];
  for (const raw of input) {
    if (!raw || typeof raw !== 'object') continue;
    const row = raw as Record<string, unknown>;
    const url = typeof row.url === 'string' ? row.url.trim() : '';
    if (!url) continue;
    if (!isValidHttpUrl(url)) {
      throw new Error(`Invalid webhook URL: ${url}`);
    }

    const eventsRaw = Array.isArray(row.events) ? row.events : [];
    const events = Array.from(
      new Set(eventsRaw.filter(isWebhookEvent))
    ) as WebhookEvent[];

    if (!events.length) {
      throw new Error(`Select at least one event for webhook: ${url}`);
    }

    webhooks.push({
      url,
      events,
      enabled: row.enabled === false ? false : true,
    });
  }

  // One webhook per project (last wins if duplicates)
  const byUrl = new Map<string, ProjectWebhook>();
  for (const hook of webhooks) {
    byUrl.set(hook.url, hook);
  }
  const unique = Array.from(byUrl.values());
  if (unique.length > 1) {
    throw new Error('Only one webhook URL is allowed per project');
  }
  return unique.slice(0, 1);
}

/** Convert legacy webhookUrls into webhooks when reading old docs. */
export function coerceProjectWebhooks(project: {
  webhooks?: unknown;
  webhookUrls?: unknown;
}): ProjectWebhook[] {
  if (Array.isArray(project.webhooks) && project.webhooks.length) {
    try {
      // Prefer first valid webhook only
      const normalized = normalizeProjectWebhooks(project.webhooks.slice(0, 1));
      return normalized.slice(0, 1);
    } catch {
      return [];
    }
  }
  if (Array.isArray(project.webhookUrls) && project.webhookUrls.length) {
    try {
      return normalizeProjectWebhooks(project.webhookUrls.slice(0, 1));
    } catch {
      return [];
    }
  }
  return [];
}

export async function dispatchProjectWebhooks(
  webhooks: ProjectWebhook[] | undefined | null,
  payload: WebhookPayload
): Promise<void> {
  const targets = (webhooks || []).filter(
    (hook) =>
      hook.enabled !== false &&
      isValidHttpUrl(hook.url) &&
      hook.events.includes(payload.event)
  );
  if (!targets.length) return;

  const body = JSON.stringify(payload);

  await Promise.allSettled(
    targets.map(async (hook) => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8_000);
      try {
        const res = await fetch(hook.url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'DoqSeal-Webhooks/1.0',
            'X-DoqSeal-Event': payload.event,
          },
          body,
          signal: controller.signal,
        });
        if (!res.ok) {
          console.warn(
            `[webhook] ${hook.url} responded ${res.status} for ${payload.event} ${payload.documentId}`
          );
        }
      } catch (error) {
        console.warn(
          `[webhook] failed ${hook.url} for ${payload.event} ${payload.documentId}:`,
          error instanceof Error ? error.message : error
        );
      } finally {
        clearTimeout(timer);
      }
    })
  );
}

export { WEBHOOK_EVENTS };
export default { dispatchProjectWebhooks, normalizeProjectWebhooks };
