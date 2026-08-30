/** Shared webhook event types for project automations. */

export const WEBHOOK_EVENTS = [
  'document.uploaded',
  'document.processing',
  'document.processed',
  'document.failed',
] as const;

export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

export type ProjectWebhook = {
  url: string;
  events: WebhookEvent[];
  enabled?: boolean;
};

export const WEBHOOK_EVENT_META: Record<
  WebhookEvent,
  { label: string; description: string }
> = {
  'document.uploaded': {
    label: 'Uploaded',
    description: 'File saved and extraction job created',
  },
  'document.processing': {
    label: 'Processing',
    description: 'AI worker started extracting the file',
  },
  'document.processed': {
    label: 'Processed',
    description: 'Extraction finished successfully',
  },
  'document.failed': {
    label: 'Failed',
    description: 'Extraction failed',
  },
};

export function isWebhookEvent(value: unknown): value is WebhookEvent {
  return (
    typeof value === 'string' &&
    (WEBHOOK_EVENTS as readonly string[]).includes(value)
  );
}
