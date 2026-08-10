import fs from 'fs/promises';
import path from 'path';

const DEFAULT_STORAGE_ROOT = path.resolve(__dirname, '../../storage');

export class StorageUtil {
  public static getRoot(): string {
    return process.env.STORAGE_ROOT
      ? path.resolve(process.env.STORAGE_ROOT)
      : DEFAULT_STORAGE_ROOT;
  }

  public static buildDocumentDir(
    organisationId: string,
    projectId: string,
    documentId: string
  ): string {
    return path.join(
      StorageUtil.getRoot(),
      organisationId,
      projectId,
      documentId
    );
  }

  public static async ensureDocumentDir(
    organisationId: string,
    projectId: string,
    documentId: string
  ): Promise<string> {
    const dir = StorageUtil.buildDocumentDir(
      organisationId,
      projectId,
      documentId
    );
    await fs.mkdir(dir, { recursive: true });
    return dir;
  }

  public static buildOriginalPath(
    organisationId: string,
    projectId: string,
    documentId: string,
    filename: string
  ): string {
    const safeName = filename.startsWith('original')
      ? filename
      : `original${filename.startsWith('.') ? filename : `.${filename}`}`;
    return path.join(
      StorageUtil.buildDocumentDir(organisationId, projectId, documentId),
      safeName
    );
  }
}

export default StorageUtil;