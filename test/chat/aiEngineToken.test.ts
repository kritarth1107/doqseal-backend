import { describe, it, expect } from 'vitest';
import jwt from 'jsonwebtoken';
import { aiEngineAuthHeaders, aiEngineSecret, mintAiEngineToken } from '../../utils/aiEngineToken.util';

const SECRET = 'unit-secret-0123456789abcdef-0123456789';

describe('ai-engine service token', () => {
  it('prefers AI_ENGINE_JWT_SECRET and accepts AI_ENGINE_SERVICE_TOKEN as an alias', () => {
    expect(aiEngineSecret({ AI_ENGINE_JWT_SECRET: ' a ', AI_ENGINE_SERVICE_TOKEN: 'b' } as any)).toBe('a');
    expect(aiEngineSecret({ AI_ENGINE_SERVICE_TOKEN: 'b' } as any)).toBe('b');
    expect(aiEngineSecret({} as any)).toBe('');
  });

  it('mints a short-lived HS256 token with the contract claims', () => {
    const token = mintAiEngineToken({ organisationId: 'org-a', userId: 'u1', projectId: 'p1', scope: 'chat', secret: SECRET, ttlSeconds: 9999 });
    const header = JSON.parse(Buffer.from(token.split('.')[0], 'base64url').toString());
    expect(header.alg).toBe('HS256');
    const claims = jwt.verify(token, SECRET, { issuer: 'doqseal-backend', audience: 'doqseal-ai-engine' }) as jwt.JwtPayload;
    expect(claims).toMatchObject({ org: 'org-a', sub: 'u1', pid: 'p1', scope: 'chat' });
    expect(claims.exp! - claims.iat!).toBe(300);
    expect(claims.jti).toMatch(/[0-9a-f-]{36}/);
  });

  it('refuses to mint without a secret or organisation', () => {
    expect(() => mintAiEngineToken({ organisationId: 'o', scope: 'chat', secret: '' })).toThrow();
    expect(() => mintAiEngineToken({ organisationId: '', scope: 'chat', secret: SECRET })).toThrow();
  });

  it('returns no header in legacy mode', () => {
    const saved = { ...process.env };
    delete process.env.AI_ENGINE_JWT_SECRET;
    delete process.env.AI_ENGINE_SERVICE_TOKEN;
    expect(aiEngineAuthHeaders({ organisationId: 'o', scope: 'chat' })).toEqual({});
    process.env.AI_ENGINE_JWT_SECRET = SECRET;
    expect(aiEngineAuthHeaders({ organisationId: 'o', scope: 'chat' }).Authorization).toMatch(/^Bearer /);
    process.env = saved;
  });
});
