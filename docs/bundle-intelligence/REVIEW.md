# Bundle review API

Endpoints the dashboard uses to review a bundle. All routes sit under
`/api/v1`, need a user session plus the `x-organisation-id` header, and return
403 `FEATURE_DISABLED` unless the organisation has `features.bundles = true`.
Every query is scoped by organisation; a bundle from another organisation is a
404. Membership and role failures on these endpoints are 403.

## Starter templates

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/bundle-templates/starters` | Built-in starters for every vertical (diagnostics, lending, mutual funds, insurance, vendor onboarding) with their slots. `templateId` is set when the organisation already has a copy. |
| POST | `/bundle-templates/starters/:starterKey` | Body `{ name?, projectId? }`. Copies the starter into the organisation and publishes version 1 (201). Returns the existing copy when there is one (200). Audit `template.create_from_starter`. |

Starters live in `constants/bundleStarterTemplates.ts` (also used by
`scripts/seed-example-templates.ts`), so no seeding is needed.

## Reading a bundle

`GET /bundles/:bundleId` now also returns:

- `template`: pinned version, name, slots (`documentTypes[{ key, label, required, conditional, minCount, maxCount }]`) and profile fields.
- `pipeline`: the latest summary (checklist, missing, conflicts, document counts). Each conflict carries `key`, `valuesHash`, `status` (`open | resolved | dismissed`) and `resolution`.
- `progress`: `{ requiredSlots, requiredSlotsMet, missing, openConflicts, needsAttention, inProgress }`.
- `review`: `{ reviewedAt, note, reviewer }` once marked reviewed.
- `documents[]`: `filename`, `mimeType`, `size`, `extractionStatus`, `available`, `restricted` (another member's private document: listed without its name) and `classification` (`status, suggestedTypeKey, confidence, alternatives, reasons, lastError`).

A summary written before conflict review existed (or a bundle never evaluated)
is refreshed once on read.

`GET /bundles` accepts `q` (case-insensitive search on name and external
reference) and a comma-separated `status`, and each item adds `templateName`,
`progress` and `reviewed`.

## Review actions

| Method | Path | Notes |
| --- | --- | --- |
| PATCH | `/bundles/:bundleId/documents/:documentId` | `{ typeKey }`. The slot must exist in the pinned template (400 otherwise). Settles a low-confidence or failed classification. |
| POST | `/bundles/:bundleId/conflicts` | `{ field, valuesHash, action: resolve \| dismiss \| reopen, value?, reason? }`. `resolve` needs `value`, one of the conflicting values. `dismiss` needs a reason and the admin role. `reopen` undoes a decision. 409 when the conflict changed since it was read. Returns the bundle. |
| POST | `/bundles/:bundleId/review` | `{ note? }`. Moves the bundle to `ready` when nothing is open (every required slot filled, no document waiting for a slot, no open conflicts); 409 with the open items otherwise. Idempotent. |
| GET | `/bundles/:bundleId/timeline?limit=` | Pipeline events and people's actions from the audit log, newest first (max 200). |

Decisions on conflicts are stored in `bundle_exception_actions` (runId
`pipeline`) against the conflict key and a hash of its values. When the values
change the decision lapses and the conflict opens again. A reviewed bundle
that changes (documents added, removed or moved to another slot, or a
conflict reopened) goes back to `needs_review` and records
`bundle.review_cleared`.

Marking a bundle reviewed records that a person checked it. It is not a
decision on the customer or the case.

## Status without automatic classification

Completeness, conflicts and status need no model call, so they are evaluated
even when `BUNDLE_PIPELINE_ENABLED` is off: people sort documents into slots
and the status follows. Documents that have no slot and are not being
classified keep the bundle in `needs_review`.

## Events

New `bundle_events` / audit actions: `bundle.conflict_resolved`,
`bundle.conflict_dismissed`, `bundle.reviewed`, `bundle.review_cleared`
(recorded with the acting user), plus audit-only `bundle.conflict_reopened`.
