import mongoose, { Schema, Document as MongooseDocument } from 'mongoose';

export type DocumentStatus =
  | 'uploaded'
  | 'queued'
  | 'processing'
  | 'completed'
  | 'failed';

export interface IDocument extends MongooseDocument {
  documentId: string;
  organisationId: string;
  /** Null = organisation Drive / common library (no project) */
  projectId?: string | null;
  originalFilename: string;
  mimeType: string;
  size: number;
  /** Blob object key (preferred) or legacy absolute local path */
  storagePath: string;
  /** Full HTTPS blob URI (no SAS) when using Azure Blob */
  storageUri?: string | null;
  storageProvider?: 'azure-blob' | 'local' | null;
  contentHash?: string;
  isEncrypted: boolean;
  encryption?: {
    iv: string;
    authTag: string;
    encryptedDEK: string;
    dekIv: string;
    dekAuthTag: string;
  } | null;
  status: DocumentStatus;
  uploadedBy: string;
  /** When false, only the uploader (within the org) can see this document */
  sharedWithOrganisation: boolean;
  consentGivenAt?: Date | null;
  deletedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const DocumentSchema: Schema = new Schema(
  {
    documentId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    organisationId: {
      type: String,
      required: true,
      index: true,
    },
    projectId: {
      type: String,
      default: null,
      index: true,
    },
    originalFilename: {
      type: String,
      required: true,
    },
    mimeType: {
      type: String,
      required: true,
    },
    size: {
      type: Number,
      required: true,
    },
    storagePath: {
      type: String,
      required: true,
    },
    storageUri: {
      type: String,
      default: null,
    },
    storageProvider: {
      type: String,
      enum: ['azure-blob', 'local'],
      default: null,
    },
    contentHash: {
      type: String,
      default: null,
    },
    isEncrypted: {
      type: Boolean,
      default: false,
    },
    encryption: {
      type: {
        iv: String,
        authTag: String,
        encryptedDEK: String,
        dekIv: String,
        dekAuthTag: String,
      },
      default: null,
    },
    status: {
      type: String,
      enum: ['uploaded', 'queued', 'processing', 'completed', 'failed'],
      default: 'uploaded',
      index: true,
    },
    uploadedBy: {
      type: String,
      required: true,
      index: true,
    },
    sharedWithOrganisation: {
      type: Boolean,
      default: false,
      index: true,
    },
    consentGivenAt: {
      type: Date,
      default: null,
    },
    deletedAt: {
      type: Date,
      default: null,
      index: true,
    },
  },
  {
    timestamps: true,
    collection: 'documents',
  }
);

DocumentSchema.index({ organisationId: 1, projectId: 1, deletedAt: 1 });
DocumentSchema.index({ projectId: 1, status: 1, deletedAt: 1 });
DocumentSchema.index({
  organisationId: 1,
  sharedWithOrganisation: 1,
  uploadedBy: 1,
  deletedAt: 1,
});

const Document = mongoose.model<IDocument>('Document', DocumentSchema);

export default Document;