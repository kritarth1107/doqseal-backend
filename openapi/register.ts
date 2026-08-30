import { FastifyInstance } from 'fastify';
import swagger from '@fastify/swagger';
import scalarApiReference from '@scalar/fastify-api-reference';
import { jsonSchemaTransform } from 'fastify-type-provider-zod';
import config from '../config/app.config';

/**
 * Registers OpenAPI generation (@fastify/swagger) and Scalar UI at /docs.
 */
export async function registerOpenApi(app: FastifyInstance): Promise<void> {
  const apiVersion = config.server.apiVersion || 'v1';
  const port = config.server.port;

  await app.register(swagger, {
    openapi: {
      openapi: '3.1.0',
      info: {
        title: 'DoqSeal API',
        description:
          'DoqSeal backend API — auth, organisations, documents, extraction jobs, chat, and envelopes.\n\n' +
          'Authenticate with `Authorization: Bearer <session_token>` on protected routes.\n' +
          'Optional client headers: `x-fingerprint`, `User-Agent`.',
        version: '1.0.0',
        contact: {
          name: 'DoqSeal',
          url: 'https://www.doqseal.com',
        },
      },
      servers: [
        {
          url: `http://localhost:${port}`,
          description: 'Local development',
        },
        {
          url: 'https://doqseal-prod-backend.graybush-3e61ef54.centralindia.azurecontainerapps.io',
          description: 'Azure production',
        },
      ],
      tags: [
        { name: 'Health', description: 'Liveness and dependency checks' },
        { name: 'Auth', description: 'OTP and social authentication (kingdom)' },
        { name: 'User', description: 'Current user profile and org creation' },
        { name: 'Organisations', description: 'Organisation details, usage, DPDP erase' },
        { name: 'Membership', description: 'Invites and member management' },
        { name: 'Invites', description: 'Accept organisation invites' },
        { name: 'API Keys', description: 'Organisation API keys (api-wickets)' },
        { name: 'Projects', description: 'Document intelligence projects' },
        { name: 'Documents', description: 'Upload, list, download, delete documents' },
        { name: 'Jobs', description: 'Extraction job status' },
        { name: 'Audit', description: 'Organisation audit events' },
        { name: 'Chat', description: 'RAG document chat' },
        { name: 'Envelopes', description: 'E-sign envelopes (feature-flagged)' },
        { name: 'Envelopes Public', description: 'Public signer links' },
      ],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
            description: 'Session JWT from OTP/social login (`session_token`)',
          },
        },
      },
    },
    transform: jsonSchemaTransform,
  });

  await app.register(scalarApiReference, {
    routePrefix: '/docs',
    configuration: {
      title: 'DoqSeal API Reference',
      theme: 'purple',
      layout: 'modern',
      defaultHttpClient: {
        targetKey: 'javascript',
        clientKey: 'fetch',
      },
      metaData: {
        title: 'DoqSeal API Docs',
        description: `Interactive reference for DoqSeal API ${apiVersion}`,
      },
    },
  });
}
