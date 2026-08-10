# DPDP compliance — backend role

DoqSeal is a **Data Processor**; diagnostic centers are **Data Fiduciaries**.

## Backend responsibilities

- Log consent at upload (`consentGivenAt`)
- Audit events for upload, view, delete
- Envelope encryption at rest
- Cascade delete: document → extraction (Qdrant via ai-engine)
- No PHI to external US APIs

## India storage

Production: MongoDB Atlas ap-south-1, S3 ap-south-1, compute in Mumbai VPC.
