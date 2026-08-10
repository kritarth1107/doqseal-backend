# Architecture — doqseal-backend

## Flow

```
Client → Fastify API → MongoDB
              ↓
         RabbitMQ (extraction.jobs) → ai-engine worker
              ↓
         Encrypted files → ../storage/
```

## Layers

| Layer | Role |
|-------|------|
| routes | HTTP definitions, auth hooks |
| controller | Request parsing, response |
| service | Business logic |
| model | Mongoose schemas |

## Security

- JWT sessions via `/api/v1/kingdom/*`
- Envelope encryption per org (AES) on document upload
- Org scoping on all queries via `organisationId`
