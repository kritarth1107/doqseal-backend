# Document chat

Answers come only from the organisation's own documents, with citations; the
ai-engine declines questions its documents do not cover. See the ai-engine's
`docs/interfaces.md` for the event protocol.

## Endpoints (userAuth + `x-organisation-id` membership)

- `POST /api/v1/chat/stream` `{ message, conversationId?, projectId? }` →
  `text/event-stream`. Starts with `run.started { runId, conversationId }`
  (also in the `X-Conversation-Id` header), then the ai-engine's `step`, `token`,
  `citation`, `decline`, `run.completed` or `error` events, and `: ping` every 15 s.
  History is loaded from the stored conversation (the last 10 turns); client-sent
  history is ignored. Both turns are stored before the stream ends. A client
  disconnect cancels the ai-engine request and stores the partial answer with
  mode `aborted`. Returns 404 while no service secret is configured, so the
  dashboard falls back to `POST /api/v1/chat`.
- `POST /api/v1/chat` `{ message, projectId? }` — unchanged non-streaming answer.
- `GET /api/v1/chat/conversations?limit&before`, `GET /api/v1/chat/conversations/:id`,
  `PATCH /api/v1/chat/conversations/:id { title }`, `DELETE /api/v1/chat/conversations/:id`.
  Every query filters by organisation and user; anything else is a 404.

Collections: `chat_conversations`, `chat_messages` (created on first write).

## Service credential

Each ai-engine call carries a short-lived HS256 JWT (`iss doqseal-backend`,
`aud doqseal-ai-engine`, `org` from the session, `sub` user, `pid`, `scope`,
at most 5 minutes, `jti`) signed with `AI_ENGINE_JWT_SECRET` (alias
`AI_ENGINE_SERVICE_TOKEN`). The same value must be set on the ai-engine. Without
it the legacy endpoint keeps working unauthenticated and streaming is off.
