# Agent instructions — doqseal-backend

## Conventions

- Fastify + TypeScript, flat structure: `routes/` → `controller/` → `service/` → `model/`
- Auth: `userAuth` middleware on protected routes
- Responses: use `response.util` (`success` / `error`)
- Route prefix: `/api/v1/`

## Do NOT

- Commit `.env`, secrets, or `logs/`
- Call US LLM APIs with PHI (chat proxies to ai-engine)
- Break `AES_SECRET` parity with ai-engine

## Before pushing

```bash
npm run lint
```

## Cross-repo

Queue payloads and Mongo schemas: see `docs/interfaces.md`.
Must match [doqseal-ai-engine](https://github.com/Noooblien/doqseal-ai-engine).
