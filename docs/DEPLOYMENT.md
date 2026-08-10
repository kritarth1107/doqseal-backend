# Deployment — backend

## Production checklist

- `NODE_ENV=production`
- MongoDB Atlas **ap-south-1**
- `STORAGE_ROOT` → S3-compatible bucket in India
- `AMQP_URI` → RabbitMQ in same VPC as ai-engine
- `CORS_ORIGINS` → production frontend URL
