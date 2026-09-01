import Organisation from '../model/organisation.model';
import {
  isWebhookEvent,
  OrgWebhook,
  WEBHOOK_EVENTS,
  WebhookEvent,
} from '../constants/webhook.events';
import auditService from './audit.service';

export type WebhookPayload = {
  event: WebhookEvent;
  organisationId: string;
  projectId?: string | null;
  documentId?: string | null;
  jobId?: string | null;
  status?: string | null;
  originalFilename?: string | null;
  displayTitle?: string | null;
  error?: string | null;
  metadata?: Record<string, unknown>;
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

export function normalizeOrgWebhooks(input: unknown): OrgWebhook[] {
  if (!Array.isArray(input)) return [];

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
      throw new Error('Only one webhook URL is allowed per organisation');
    }
    return urls.slice(0, 1).map((url) => ({
      url,
      events: ['document.processed'] as WebhookEvent[],
      enabled: true,
    }));
  }

  const webhooks: OrgWebhook[] = [];
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

  const byUrl = new Map<string, OrgWebhook>();
  for (const hook of webhooks) {
    byUrl.set(hook.url, hook);
  }
  const unique = Array.from(byUrl.values());
  if (unique.length > 1) {
    throw new Error('Only one webhook URL is allowed per organisation');
  }
  return unique.slice(0, 1);
}

export function coerceOrgWebhooks(org: { webhooks?: unknown }): OrgWebhook[] {
  if (!Array.isArray(org.webhooks) || !org.webhooks.length) return [];
  try {
    return normalizeOrgWebhooks(org.webhooks.slice(0, 1)).slice(0, 1);
  } catch {
    return [];
  }
}

export async function getOrganisationWebhooks(
  organisationId: string
): Promise<OrgWebhook[]> {
  const org = await Organisation.findOne({
    publicId: organisationId,
    deletedAt: null,
  })
    .select('webhooks')
    .lean();
  if (!org) return [];
  return coerceOrgWebhooks(org);
}

export async function dispatchOrganisationWebhooks(
  organisationId: string,
  payload: WebhookPayload
): Promise<void> {
  const webhooks = await getOrganisationWebhooks(organisationId);
  await dispatchWebhooks(webhooks, payload);
}

export async function dispatchWebhooks(
  webhooks: OrgWebhook[] | undefined | null,
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
      let statusCode: number | null = null;
      let success = false;
      let errorMessage: string | null = null;
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
        statusCode = res.status;
        success = res.ok;
        if (!res.ok) {
          errorMessage = `HTTP ${res.status}`;
          console.warn(
            `[webhook] ${hook.url} responded ${res.status} for ${payload.event}`
          );
        }
      } catch (error) {
        errorMessage =
          error instanceof Error ? error.message : 'Webhook request failed';
        console.warn(
          `[webhook] failed ${hook.url} for ${payload.event}:`,
          errorMessage
        );
      } finally {
        clearTimeout(timer);
        try {
          await auditService.logEvent({
            actorId: 'system:webhook',
            organisationId: payload.organisationId,
            action: success ? 'webhook.dispatched' : 'webhook.failed',
            resourceType: 'webhook',
            resourceId: payload.documentId || payload.organisationId,
            metadata: {
              documentId: payload.documentId ?? null,
              projectId: payload.projectId ?? null,
              jobId: payload.jobId ?? null,
              event: payload.event,
              url: hook.url,
              success,
              statusCode,
              error: errorMessage,
            },
          });
        } catch (auditErr) {
          console.warn('[webhook] audit log failed', auditErr);
        }
      }
    })
  );
}

/** @deprecated Use dispatchOrganisationWebhooks */
export async function dispatchProjectWebhooks(
  webhooks: OrgWebhook[] | undefined | null,
  payload: WebhookPayload
): Promise<void> {
  return dispatchWebhooks(webhooks, payload);
}

/** @deprecated Use normalizeOrgWebhooks */
export const normalizeProjectWebhooks = normalizeOrgWebhooks;

/** @deprecated Use coerceOrgWebhooks */
export function coerceProjectWebhooks(project: {
  webhooks?: unknown;
  webhookUrls?: unknown;
}): OrgWebhook[] {
  if (Array.isArray(project.webhooks) && project.webhooks.length) {
    try {
      return normalizeOrgWebhooks(project.webhooks.slice(0, 1)).slice(0, 1);
    } catch {
      return [];
    }
  }
  if (Array.isArray(project.webhookUrls) && project.webhookUrls.length) {
    try {
      return normalizeOrgWebhooks(project.webhookUrls.slice(0, 1));
    } catch {
      return [];
    }
  }
  return [];
}

export { WEBHOOK_EVENTS };
export default {
  dispatchOrganisationWebhooks,
  dispatchWebhooks,
  getOrganisationWebhooks,
  normalizeOrgWebhooks,
};
