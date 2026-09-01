import crypto from 'crypto';

const APP_ID_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const APP_ID_LENGTH = 15;
const NONCE_BYTES = 12;
const SIG_LENGTH = 16;

function signingSecret(): string {
  const secret = process.env.API_KEY_SIGNING_SECRET || process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('API_KEY_SIGNING_SECRET or JWT_SECRET must be configured');
  }
  return secret;
}

/** 15-character uppercase alphanumeric APP ID */
export function generateAppId(): string {
  const bytes = crypto.randomBytes(APP_ID_LENGTH);
  let result = '';
  for (let i = 0; i < APP_ID_LENGTH; i++) {
    result += APP_ID_CHARS[bytes[i]! % APP_ID_CHARS.length];
  }
  return result;
}

function signPayload(appId: string, nonce: string): string {
  return crypto
    .createHmac('sha256', signingSecret())
    .update(`${appId}:${nonce}`)
    .digest('base64url')
    .slice(0, SIG_LENGTH);
}

/**
 * Generate a compact secret derived from APP_ID.
 * Format: `{nonce}.{signature}` (~33 chars). Full secret is never stored.
 */
export function generateSecretKey(appId: string): {
  secretKey: string;
  secretHint: string;
} {
  const nonce = crypto.randomBytes(NONCE_BYTES).toString('base64url');
  const signature = signPayload(appId, nonce);
  const secretKey = `${nonce}.${signature}`;
  return {
    secretKey,
    secretHint: secretKey.slice(-6),
  };
}

/** Verify a secret against APP_ID without storing the full value */
export function verifySecretKey(
  appId: string,
  secretKey: string,
  storedHint: string
): boolean {
  if (!appId || !secretKey || secretKey.length < 8) return false;
  if (secretKey.slice(-6) !== storedHint) return false;

  const dotIndex = secretKey.indexOf('.');
  if (dotIndex <= 0 || dotIndex >= secretKey.length - 1) return false;

  const nonce = secretKey.slice(0, dotIndex);
  const providedSig = secretKey.slice(dotIndex + 1);
  const expectedSig = signPayload(appId, nonce);

  if (providedSig.length !== expectedSig.length) return false;

  try {
    return crypto.timingSafeEqual(
      Buffer.from(providedSig),
      Buffer.from(expectedSig)
    );
  } catch {
    return false;
  }
}

export function maskSecretHint(hint: string): string {
  return `••••••${hint}`;
}
