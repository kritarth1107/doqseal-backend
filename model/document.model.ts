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
  projectId: string;
  originalFilename: string;
  mimeType: string;
  size: number;
  storagePath: string;
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
      required: true,
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

const Document = mongoose.model<IDocument>('Document', DocumentSchema);

export default Document;