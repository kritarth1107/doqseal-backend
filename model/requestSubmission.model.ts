import mongoose, { Schema, Document } from 'mongoose';

export interface ISubmissionFile {
  requirementId: string;
  documentId: string;
  originalFilename: string;
}

export interface IRequestSubmission extends Document {
  submissionId: string;
  requestLinkId: string;
  organisationId: string;
  name?: string | null;
  email?: string | null;
  mobile?: string | null;
  emailVerified: boolean;
  mobileVerified: boolean;
  consentPrivacyAt: Date;
  consentTermsAt: Date;
  consentDpaAt: Date;
  files: ISubmissionFile[];
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

const FileSchema = new Schema(
  {
    requirementId: { type: String, required: true },
    documentId: { type: String, required: true },
    originalFilename: { type: String, required: true },
  },
  { _id: false }
);

const RequestSubmissionSchema = new Schema(
  {
    submissionId: { type: String, required: true, unique: true, index: true },
    requestLinkId: { type: String, required: true, index: true },
    organisationId: { type: String, required: true, index: true },
    name: { type: String, default: null, trim: true },
    email: { type: String, default: null, trim: true, lowercase: true },
    mobile: { type: String, default: null, trim: true },
    emailVerified: { type: Boolean, default: false },
    mobileVerified: { type: Boolean, default: false },
    consentPrivacyAt: { type: Date, required: true },
    consentTermsAt: { type: Date, required: true },
    consentDpaAt: { type: Date, required: true },
    files: { type: [FileSchema], default: [] },
    metadata: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

RequestSubmissionSchema.index({ requestLinkId: 1, createdAt: -1 });
RequestSubmissionSchema.index({ organisationId: 1, createdAt: -1 });

export default mongoose.model<IRequestSubmission>(
  'RequestSubmission',
  RequestSubmissionSchema
);
