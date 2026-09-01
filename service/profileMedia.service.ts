import {
  deletePublicMedia,
  getActiveStorageProvider,
  putPublicMedia,
} from '../utils/blob-storage.util';

const MAX_BYTES = 2 * 1024 * 1024;
const ALLOWED_MIME = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/gif',
]);

function extForMime(mime: string): string {
  if (mime === 'image/png') return '.png';
  if (mime === 'image/webp') return '.webp';
  if (mime === 'image/gif') return '.gif';
  return '.jpg';
}

function validateImage(buffer: Buffer, mimeType: string) {
  if (!ALLOWED_MIME.has(mimeType.toLowerCase())) {
    throw new Error('Only JPEG, PNG, WebP, or GIF images are allowed');
  }
  if (buffer.length > MAX_BYTES) {
    throw new Error('Image must be 2 MB or smaller');
  }
  if (buffer.length < 32) {
    throw new Error('Invalid image file');
  }
}

export function buildUserAvatarKey(userId: string, mimeType: string): string {
  return `profiles/users/${userId}/avatar${extForMime(mimeType)}`;
}

export function buildOrgLogoKey(organisationId: string, mimeType: string): string {
  return `profiles/orgs/${organisationId}/logo${extForMime(mimeType)}`;
}

export function profileMediaUrl(objectKey: string): string {
  const encoded = objectKey
    .split('/')
    .map((part) => encodeURIComponent(part))
    .join('/');
  return `/api/v1/media/profile/${encoded}`;
}

export class ProfileMediaService {
  public async uploadUserAvatar(params: {
    userId: string;
    buffer: Buffer;
    mimeType: string;
    previousKey?: string | null;
  }) {
    validateImage(params.buffer, params.mimeType);
    const objectKey = buildUserAvatarKey(params.userId, params.mimeType);
    const stored = await putPublicMedia(
      objectKey,
      params.buffer,
      params.mimeType
    );

    if (params.previousKey && params.previousKey !== objectKey) {
      await deletePublicMedia({
        storagePath: params.previousKey,
        storageProvider: getActiveStorageProvider(),
      }).catch(() => undefined);
    }

    return {
      objectKey,
      url: profileMediaUrl(objectKey),
      storageProvider: stored.storageProvider,
    };
  }

  public async uploadOrgLogo(params: {
    organisationId: string;
    buffer: Buffer;
    mimeType: string;
    previousKey?: string | null;
  }) {
    validateImage(params.buffer, params.mimeType);
    const objectKey = buildOrgLogoKey(params.organisationId, params.mimeType);
    const stored = await putPublicMedia(
      objectKey,
      params.buffer,
      params.mimeType
    );

    if (params.previousKey && params.previousKey !== objectKey) {
      await deletePublicMedia({
        storagePath: params.previousKey,
        storageProvider: getActiveStorageProvider(),
      }).catch(() => undefined);
    }

    return {
      objectKey,
      url: profileMediaUrl(objectKey),
      storageProvider: stored.storageProvider,
    };
  }

  public resolveObjectKeyFromUrl(url?: string | null): string | null {
    if (!url) return null;
    const marker = '/media/profile/';
    const idx = url.indexOf(marker);
    if (idx >= 0) {
      return decodeURIComponent(url.slice(idx + marker.length));
    }
    if (!url.startsWith('http') && !url.startsWith('file://')) {
      return url.replace(/^\/+/, '');
    }
    return null;
  }

  public isProfileObjectKey(objectKey: string): boolean {
    const normalized = objectKey.replace(/^\/+/, '');
    return (
      normalized.startsWith('profiles/users/') ||
      normalized.startsWith('profiles/orgs/')
    );
  }

  public async assertCanReadProfileMedia(params: {
    objectKey: string;
    userId: string;
    organisationIds: string[];
  }) {
    const key = params.objectKey.replace(/^\/+/, '');
    if (key.startsWith('profiles/users/')) {
      const ownerId = key.split('/')[2];
      if (ownerId !== params.userId) {
        throw new Error('Access denied');
      }
      return;
    }
    if (key.startsWith('profiles/orgs/')) {
      const orgId = key.split('/')[2];
      if (!params.organisationIds.includes(orgId)) {
        throw new Error('Access denied');
      }
      return;
    }
    throw new Error('Invalid media path');
  }
}

export default new ProfileMediaService();
