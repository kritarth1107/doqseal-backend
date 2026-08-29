import { BlobServiceClient, ContainerClient } from '@azure/storage-blob';
import path from 'path';
import fs from 'fs/promises';
import config from '../config/app.config';

export type StorageProvider = 'azure-blob' | 'local';

function requireAzureConfig() {
  const connectionString = config.storage.azureConnectionString?.trim();
  const containerName = config.storage.azureContainer?.trim();
  if (!connectionString || !containerName) {
    throw new Error(
      'Azure Blob is not configured. Set AZURE_STORAGE_CONNECTION_STRING and AZURE_STORAGE_CONTAINER.'
    );
  }
  return { connectionString, containerName };
}

let containerClient: ContainerClient | null = null;

function getContainerClient(): ContainerClient {
  if (containerClient) return containerClient;
  const { connectionString, containerName } = requireAzureConfig();
  const service = BlobServiceClient.fromConnectionString(connectionString);
  containerClient = service.getContainerClient(containerName);
  return containerClient;
}

export function isAzureBlobEnabled(): boolean {
  return Boolean(
    config.storage.azureConnectionString?.trim() &&
      config.storage.azureContainer?.trim()
  );
}

export function getActiveStorageProvider(): StorageProvider {
  return isAzureBlobEnabled() ? 'azure-blob' : 'local';
}

/** Relative blob key / legacy local relative path */
export function buildObjectKey(
  organisationId: string,
  projectId: string,
  documentId: string,
  filename: string
): string {
  const safeName = filename.startsWith('original')
    ? filename
    : `original${filename.startsWith('.') ? filename : `.${filename}`}`;
  return [organisationId, projectId, documentId, safeName]
    .map((part) => part.replace(/\\/g, '/').replace(/^\/+|\/+$/g, ''))
    .join('/');
}

export function buildBlobUri(objectKey: string): string {
  const { connectionString, containerName } = requireAzureConfig();
  // Prefer account name from connection string
  const match = connectionString.match(/AccountName=([^;]+)/i);
  const accountName = match?.[1];
  if (!accountName) {
    throw new Error('Could not parse AccountName from AZURE_STORAGE_CONNECTION_STRING');
  }
  const key = objectKey.replace(/^\/+/, '');
  return `https://${accountName}.blob.core.windows.net/${containerName}/${key}`;
}

export async function putEncryptedObject(
  objectKey: string,
  ciphertext: Buffer
): Promise<{ storagePath: string; storageUri: string; storageProvider: StorageProvider }> {
  if (!isAzureBlobEnabled()) {
    const root = path.resolve(config.storage.root);
    const fullPath = path.join(root, ...objectKey.split('/'));
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, ciphertext);
    return {
      storagePath: fullPath,
      storageUri: `file://${fullPath.replace(/\\/g, '/')}`,
      storageProvider: 'local',
    };
  }

  const client = getContainerClient();
  const blob = client.getBlockBlobClient(objectKey);
  await blob.uploadData(ciphertext, {
    blobHTTPHeaders: {
      blobContentType: 'application/octet-stream',
    },
    metadata: {
      encrypted: 'true',
    },
  });

  return {
    storagePath: objectKey,
    storageUri: blob.url.split('?')[0],
    storageProvider: 'azure-blob',
  };
}

export async function getEncryptedObject(params: {
  storagePath: string;
  storageUri?: string | null;
  storageProvider?: StorageProvider | string | null;
}): Promise<Buffer> {
  const provider =
    params.storageProvider ||
    (params.storageUri?.startsWith('https://') ? 'azure-blob' : null) ||
    (isAzureBlobEnabled() && !path.isAbsolute(params.storagePath)
      ? 'azure-blob'
      : 'local');

  if (provider === 'azure-blob') {
    const client = getContainerClient();
    let key = params.storagePath.replace(/^\/+/, '');

    // If storagePath is a full URL, extract the key after container name
    if (key.startsWith('https://') || params.storageUri?.startsWith('https://')) {
      const uri = params.storageUri || params.storagePath;
      const { containerName } = requireAzureConfig();
      const marker = `/${containerName}/`;
      const idx = uri.indexOf(marker);
      if (idx >= 0) {
        key = decodeURIComponent(uri.slice(idx + marker.length).split('?')[0]);
      }
    }

    const blob = client.getBlockBlobClient(key);
    return await blob.downloadToBuffer();
  }

  // Legacy local filesystem
  const fullPath = path.isAbsolute(params.storagePath)
    ? params.storagePath
    : path.join(path.resolve(config.storage.root), params.storagePath);
  return await fs.readFile(fullPath);
}

export async function deleteEncryptedObject(params: {
  storagePath: string;
  storageUri?: string | null;
  storageProvider?: StorageProvider | string | null;
}): Promise<void> {
  const provider =
    params.storageProvider ||
    (params.storageUri?.startsWith('https://') ? 'azure-blob' : null) ||
    (isAzureBlobEnabled() && !path.isAbsolute(params.storagePath)
      ? 'azure-blob'
      : 'local');

  if (provider === 'azure-blob') {
    const client = getContainerClient();
    let key = params.storagePath.replace(/^\/+/, '');
    if (key.startsWith('https://') || params.storageUri?.startsWith('https://')) {
      const uri = params.storageUri || params.storagePath;
      const { containerName } = requireAzureConfig();
      const marker = `/${containerName}/`;
      const idx = uri.indexOf(marker);
      if (idx >= 0) {
        key = decodeURIComponent(uri.slice(idx + marker.length).split('?')[0]);
      }
    }
    const blob = client.getBlockBlobClient(key);
    await blob.deleteIfExists();
    return;
  }

  const fullPath = path.isAbsolute(params.storagePath)
    ? params.storagePath
    : path.join(path.resolve(config.storage.root), params.storagePath);
  await fs.unlink(fullPath);
}

/** Kept for any callers still importing StorageUtil-style helpers */
export function buildLocalDocumentDir(
  organisationId: string,
  projectId: string,
  documentId: string
): string {
  return path.join(
    path.resolve(config.storage.root),
    organisationId,
    projectId,
    documentId
  );
}

export default {
  isAzureBlobEnabled,
  getActiveStorageProvider,
  buildObjectKey,
  buildBlobUri,
  putEncryptedObject,
  getEncryptedObject,
  deleteEncryptedObject,
};
