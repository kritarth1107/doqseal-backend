/** Organisation-level webhook event types (API & integrations). */

export const WEBHOOK_EVENTS = [
  'document.uploaded',
  'document.processing',
  'document.processed',
  'document.failed',
  'document.deleted',
  'document.purged',
  'document.field_corrected',
  'document.reprocessed',
  'document.shared',
  'extraction.started',
  'extraction.completed',
  'extraction.failed',
  'project.created',
  'api_key.created',
  'api_key.revoked',
] as const;

export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

export type OrgWebhook = {
  url: string;
  events: WebhookEvent[];
  enabled?: boolean;
};

/** @deprecated Use OrgWebhook — kept for legacy project docs */
export type ProjectWebhook = OrgWebhook;

export const WEBHOOK_EVENT_META: Record<
  WebhookEvent,
  { label: string; description: string; category: string }
> = {
  'document.uploaded': {
    label: 'Document uploaded',
    description: 'File saved and extraction job queued',
    category: 'Documents',
  },
  'document.processing': {
    label: 'Document processing',
    description: 'AI worker started extracting the file',
    category: 'Documents',
  },
  'document.processed': {
    label: 'Document processed',
    description: 'Extraction finished successfully',
    category: 'Documents',
  },
  'document.failed': {
    label: 'Document failed',
    description: 'Extraction failed or was rejected',
    category: 'Documents',
  },
  'document.deleted': {
    label: 'Document deleted',
    description: 'Document soft-deleted from the organisation',
    category: 'Documents',
  },
  'document.purged': {
    label: 'Document purged',
    description: 'File removed per retention / TTL policy',
    category: 'Documents',
  },
  'document.field_corrected': {
    label: 'Field corrected',
    description: 'User edited an extracted field value',
    category: 'Documents',
  },
  'document.reprocessed': {
    label: 'Document reprocessed',
    description: 'Extraction re-run on an existing document',
    category: 'Documents',
  },
  'document.shared': {
    label: 'Document shared',
    description: 'Document visibility changed within the org',
    category: 'Documents',
  },
  'extraction.started': {
    label: 'Extraction started',
    description: 'Worker picked up the extraction job',
    category: 'Extraction',
  },
  'extraction.completed': {
    label: 'Extraction completed',
    description: 'Structured data saved and approved',
    category: 'Extraction',
  },
  'extraction.failed': {
    label: 'Extraction failed',
    description: 'Worker error or validation failure',
    category: 'Extraction',
  },
  'project.created': {
    label: 'Project created',
    description: 'New project workspace created in the org',
    category: 'Projects',
  },
  'api_key.created': {
    label: 'API key created',
    description: 'New APP ID / secret pair issued',
    category: 'API',
  },
  'api_key.revoked': {
    label: 'API key revoked',
    description: 'An API key was deactivated',
    category: 'API',
  },
};

export function isWebhookEvent(value: unknown): value is WebhookEvent {
  return (
    typeof value === 'string' &&
    (WEBHOOK_EVENTS as readonly string[]).includes(value)
  );
}

export const WEBHOOK_EVENT_CATEGORIES = [
  'Documents',
  'Extraction',
  'Projects',
  'API',
] as const;
