import crypto from 'crypto';
import config from '../config/app.config';

const ALGORITHM = 'aes-256-gcm';
const DEK_LENGTH = 32;
const IV_LENGTH = 12;
const SCRYPT_SALT = 'doqseal-envelope-v1';

export interface EncryptionEnvelope {
  ciphertext: Buffer;
  iv: string;
  authTag: string;
  encryptedDEK: string;
  dekIv: string;
  dekAuthTag: string;
}

function deriveOrgKey(organisationId: string): Buffer {
  const secret = config.encryption.secretKey;
  if (!secret || secret.length < 32) {
    throw new Error('AES_SECRET must be at least 32 characters for envelope encryption');
  }

  return crypto.scryptSync(`${secret}:${organisationId}`, SCRYPT_SALT, 32);
}

export function encryptBuffer(
  plaintext: Buffer,
  organisationId: string
): EncryptionEnvelope {
  const dek = crypto.randomBytes(DEK_LENGTH);
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, dek, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();

  const orgKey = deriveOrgKey(organisationId);
  const dekIv = crypto.randomBytes(IV_LENGTH);
  const dekCipher = crypto.createCipheriv(ALGORITHM, orgKey, dekIv);
  const encryptedDEK = Buffer.concat([dekCipher.update(dek), dekCipher.final()]);
  const dekAuthTag = dekCipher.getAuthTag();

  return {
    ciphertext,
    iv: iv.toString('base64'),
    authTag: authTag.toString('base64'),
    encryptedDEK: encryptedDEK.toString('base64'),
    dekIv: dekIv.toString('base64'),
    dekAuthTag: dekAuthTag.toString('base64'),
  };
}

export function decryptBuffer(
  envelope: EncryptionEnvelope,
  organisationId: string
): Buffer {
  const orgKey = deriveOrgKey(organisationId);
  const dekIv = Buffer.from(envelope.dekIv, 'base64');
  const dekAuthTag = Buffer.from(envelope.dekAuthTag, 'base64');
  const encryptedDEK = Buffer.from(envelope.encryptedDEK, 'base64');

  const dekDecipher = crypto.createDecipheriv(ALGORITHM, orgKey, dekIv);
  dekDecipher.setAuthTag(dekAuthTag);
  const dek = Buffer.concat([
    dekDecipher.update(encryptedDEK),
    dekDecipher.final(),
  ]);

  const iv = Buffer.from(envelope.iv, 'base64');
  const authTag = Buffer.from(envelope.authTag, 'base64');
  const decipher = crypto.createDecipheriv(ALGORITHM, dek, iv);
  decipher.setAuthTag(authTag);

  return Buffer.concat([
    decipher.update(envelope.ciphertext),
    decipher.final(),
  ]);
}

export default { encryptBuffer, decryptBuffer };