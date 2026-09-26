import jwt from 'jsonwebtoken';
import { randomUUID } from 'crypto';

/**
 * Short-lived HS256 credentials for backend -> ai-engine calls.
 * The organisation always comes from the authenticated session, never from a
 * client body; the ai-engine refuses a request whose body disagrees with the token.
 */
export type AiEngineScope = 'chat' | 'rag:read' | 'rag:delete' | 'bundle:classify';

export const AI_ENGINE_TOKEN_ISSUER = 'doqseal-backend';
export const AI_ENGINE_TOKEN_AUDIENCE = 'doqseal-ai-engine';
const DEFAULT_TTL_SECONDS = 120;
const MAX_TTL_SECONDS = 300;

/** AI_ENGINE_JWT_SECRET, or AI_ENGINE_SERVICE_TOKEN as an alias. Empty when unset. */
export function aiEngineSecret(env: NodeJS.ProcessEnv = process.env): string {
  return (env.AI_ENGINE_JWT_SECRET || env.AI_ENGINE_SERVICE_TOKEN || '').trim();
}

export interface AiEngineTokenInput {
  organisationId: string;
  userId?: string | null;
  projectId?: string | null;
  scope: AiEngineScope;
  secret?: string;
  ttlSeconds?: number;
}

export function mintAiEngineToken(input: AiEngineTokenInput): string {
  const secret = input.secret ?? aiEngineSecret();
  if (!secret) {
    throw new Error('AI engine service secret is not configured');
  }
  if (!input.organisationId) {
    throw new Error('organisationId is required for an ai-engine token');
  }
  const ttl = Math.min(MAX_TTL_SECONDS, Math.max(30, Math.floor(input.ttlSeconds ?? DEFAULT_TTL_SECONDS)));
  const payload: Record<string, unknown> = {
    org: input.organisationId,
    scope: input.scope,
  };
  if (input.projectId) payload.pid = input.projectId;
  return jwt.sign(payload, secret, {
    algorithm: 'HS256',
    issuer: AI_ENGINE_TOKEN_ISSUER,
    audience: AI_ENGINE_TOKEN_AUDIENCE,
    subject: input.userId || 'service',
    expiresIn: ttl,
    jwtid: randomUUID(),
  });
}

/** Authorization header for an ai-engine call, or {} when no secret is configured (legacy mode). */
export function aiEngineAuthHeaders(input: Omit<AiEngineTokenInput, 'secret'>): Record<string, string> {
  const secret = aiEngineSecret();
  if (!secret) return {};
  return { Authorization: `Bearer ${mintAiEngineToken({ ...input, secret })}` };
}
