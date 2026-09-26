# Bundle processing pipeline

Classifies documents added to a bundle into template slots, checks completeness
and cross-document consistency, and moves the bundle between `collecting`,
`ready_to_run` and `needs_review`. Other statuses (runs, results, read-only
bundles) are never changed by the pipeline.

## Switching it on

Automatic classification does nothing unless all of these are true (the
completeness and status evaluation runs regardless, see REVIEW.md):

| Setting | Where | Value |
| --- | --- | --- |
| `BUNDLE_PIPELINE_ENABLED` | backend env | `true` |
| `AI_ENGINE_JWT_SECRET` (alias `AI_ENGINE_SERVICE_TOKEN`) | backend and ai-engine env | the same long random secret on both; signs short-lived service JWTs (also used by chat) |
| `AI_ENGINE_URL` | backend env | already set (used by chat) |
| `features.bundlesDisabled` | organisation document | not `true` (case packs are on by default; `true` is the per-organisation kill switch) |

Optional tuning (backend): `BUNDLE_CLASSIFY_QUEUE` (default `bundle.classify`),
`BUNDLE_CLASSIFY_RETRY_DELAY_MS` (30000), `BUNDLE_CLASSIFY_PREFETCH` (4),
`BUNDLE_CLASSIFY_MIN_CONFIDENCE` (0.7), `BUNDLE_CLASSIFY_MAX_ATTEMPTS` (5),
`BUNDLE_CLASSIFY_MAX_WAIT_ATTEMPTS` (40), `BUNDLE_CLASSIFY_TIMEOUT_MS` (60000),
`BUNDLE_CLASSIFY_STALE_MS` (600000), `BUNDLE_CLASSIFY_SWEEP_MS` (120000).

## Queues

Declared by the backend on start-up when the pipeline is on (all durable, default exchange):

- `bundle.classify`: tasks `{ v: 1, taskId, organisationId, bundleId, documentId }`.
  Dead-letters to `bundle.classify.dead`.
- `bundle.classify.retry`: delayed retries. Message TTL = retry delay, then
  dead-letters back to `bundle.classify`.
- `bundle.classify.dead`: messages that could not be parsed or handled.

The backend uses its own channel, separate from the extraction queue channel.

## Flow

1. A document is attached or uploaded to a bundle. Its `bundle_documents` row
   gets `classification.status = queued` with a new `taskId`, and the task is
   published. If the broker is down the row is marked `pending`.
2. The consumer loads the row by `(organisationId, bundleId, documentId)` and
   ignores the task if the `taskId` no longer matches (stale) or the row is
   already classified (duplicate). If extraction is not finished yet it retries
   later through `bundle.classify.retry`.
3. It calls the ai-engine `POST /bundle/classify` with the org's template
   slots, the document's extracted fields and OCR text. The response must name
   the same organisation, document and request.
4. A slot with confidence at or above the minimum is assigned (`assignedBy:
   auto`). Lower confidence leaves the slot empty for a person to pick. A slot
   a user already chose is kept.
5. The bundle is evaluated: required slots missing -> `collecting`; conflicts
   between documents (name, date of birth, gender, PAN, Aadhaar last 4), or
   documents that need a person -> `needs_review`; otherwise `ready_to_run`.
   The summary is stored in `bundle.pipeline`.
6. Retryable errors (timeouts, 5xx, 429) are retried up to the maximum, then
   the document is marked `failed`. A sweeper re-queues `pending` tasks and
   tasks stuck longer than the stale window.

## Events

Recorded once per dedupe key in `bundle_events`, written to the audit log with
actor `system`, and emitted on an in-process emitter:
`bundle.document_queued`, `bundle.document_classified`,
`bundle.document_classification_failed`, `bundle.status_changed`,
`bundle.conflicts_detected`. Customer webhooks for these are not wired yet.
Review decisions (resolve or dismiss a conflict, mark reviewed) are described
in [REVIEW.md](REVIEW.md); an open conflict keeps the bundle in `needs_review`,
a resolved or dismissed one does not.

## Organisation scoping

Every query filters by `organisationId`. The ai-engine verifies the
short-lived `bundle:classify` service JWT, that its `org` claim matches the
body, and that the document belongs to that organisation before any model call.
