/**
 * Short-lived copies of the session principal and org membership role.
 * A logout or member removal on this process drops the entry immediately.
 * Another replica can still serve the previous answer for up to TTL_MS.
 */
export const AUTH_LOOKUP_TTL_MS = 15_000;

type Stamp<T> = { at: number; value: T };

function createTtlMap<T>(ttlMs: number) {
  const map = new Map<string, Stamp<T>>();

  const fresh = (key: string): T | undefined => {
    const hit = map.get(key);
    if (!hit) return undefined;
    if (Date.now() - hit.at >= ttlMs) {
      map.delete(key);
      return undefined;
    }
    return hit.value;
  };

  return {
    get: fresh,
    set(key: string, value: T) {
      map.set(key, { at: Date.now(), value });
    },
    delete(key: string) {
      map.delete(key);
    },
    deletePrefix(prefix: string) {
      for (const key of map.keys()) {
        if (key.startsWith(prefix)) map.delete(key);
      }
    },
    clear() {
      map.clear();
    },
  };
}

export type CachedPrincipal = {
  user: Record<string, unknown>;
  expiresAtMs: number | null;
};

const sessions = createTtlMap<CachedPrincipal>(AUTH_LOOKUP_TTL_MS);
const memberships = createTtlMap<string>(AUTH_LOOKUP_TTL_MS);

const sessionKey = (userId: string, token: string) => `${userId}\n${token}`;
const membershipKey = (userId: string, organisationId: string) => `${userId}\n${organisationId}`;

export function readSession(userId: string, token: string): CachedPrincipal | undefined {
  const hit = sessions.get(sessionKey(userId, token));
  if (!hit) return undefined;
  if (hit.expiresAtMs !== null && hit.expiresAtMs <= Date.now()) {
    sessions.delete(sessionKey(userId, token));
    return undefined;
  }
  return hit;
}

export function rememberSession(userId: string, token: string, principal: CachedPrincipal): void {
  sessions.set(sessionKey(userId, token), principal);
}

export function forgetSession(userId: string, token: string): void {
  sessions.delete(sessionKey(userId, token));
}

export function forgetSessionsForUser(userId: string): void {
  sessions.deletePrefix(`${userId}\n`);
}

export function readMembership(userId: string, organisationId: string): string | undefined {
  return memberships.get(membershipKey(userId, organisationId));
}

export function rememberMembership(userId: string, organisationId: string, role: string): void {
  memberships.set(membershipKey(userId, organisationId), role);
}

export function forgetMembership(userId: string, organisationId?: string): void {
  if (organisationId) {
    memberships.delete(membershipKey(userId, organisationId));
    return;
  }
  memberships.deletePrefix(`${userId}\n`);
}

export function clearAuthLookupCache(): void {
  sessions.clear();
  memberships.clear();
}
