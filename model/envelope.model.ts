import mongoose, { Schema, Document } from 'mongoose';

export type EnvelopeStatus =
  | 'draft'
  | 'sent'
  | 'in_progress'
  | 'completed'
  | 'voided';

export type EnvelopeSignerStatus =
  | 'pending'
  | 'sent'
  | 'viewed'
  | 'signed'
  | 'declined';

export type EnvelopeSignerRole = 'signer' | 'cc' | 'approver';

export type EnvelopeFieldType =
  | 'signature'
  | 'text'
  | 'date'
  | 'checkbox'
  | 'initial';

export interface IEnvelopeSigner {
  signerId: string;
  name: string;
  email: string;
  role: EnvelopeSignerRole;
  order: number;
  status: EnvelopeSignerStatus;
  accessToken?: string;
  signedAt?: Date | null;
}

export interface IEnvelopeField {
  fieldId: string;
  type: EnvelopeFieldType;
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
  signerId: string;
  label?: string;
  required: boolean;
  value?: string;
}

export interface IEnvelope extends Document {
  envelopeId: string;
  organisationId: string;
  documentId: string;
  title: string;
  message?: string;
  status: EnvelopeStatus;
  signers: IEnvelopeSigner[];
  fields: IEnvelopeField[];
  createdBy: string;
  sentAt?: Date | null;
  completedAt?: Date | null;
  deletedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const EnvelopeSignerSchema = new Schema(
  {
    signerId: { type: String, required: true },
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, trim: true, lowercase: true },
    role: {
      type: String,
      enum: ['signer', 'cc', 'approver'],
      default: 'signer',
    },
    order: { type: Number, default: 1 },
    status: {
      type: String,
      enum: ['pending', 'sent', 'viewed', 'signed', 'declined'],
      default: 'pending',
    },
    accessToken: { type: String, default: null },
    signedAt: { type: Date, default: null },
  },
  { _id: false }
);

const EnvelopeFieldSchema = new Schema(
  {
    fieldId: { type: String, required: true },
    type: {
      type: String,
      enum: ['signature', 'text', 'date', 'checkbox', 'initial'],
      required: true,
    },
    page: { type: Number, required: true, min: 1 },
    x: { type: Number, required: true },
    y: { type: Number, required: true },
    width: { type: Number, required: true },
    height: { type: Number, required: true },
    signerId: { type: String, required: true },
    label: { type: String, default: '' },
    required: { type: Boolean, default: true },
    value: { type: String, default: '' },
  },
  { _id: false }
);

const EnvelopeSchema: Schema = new Schema(
  {
    envelopeId: {
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
    documentId: {
      type: String,
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    message: {
      type: String,
      default: '',
    },
    status: {
      type: String,
      enum: ['draft', 'sent', 'in_progress', 'completed', 'voided'],
      default: 'draft',
      index: true,
    },
    signers: {
      type: [EnvelopeSignerSchema],
      default: [],
    },
    fields: {
      type: [EnvelopeFieldSchema],
      default: [],
    },
    createdBy: {
      type: String,
      required: true,
    },
    sentAt: {
      type: Date,
      default: null,
    },
    completedAt: {
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
    collection: 'envelopes',
  }
);

EnvelopeSchema.index({ organisationId: 1, status: 1, deletedAt: 1 });
EnvelopeSchema.index({ documentId: 1, deletedAt: 1 });

const Envelope = mongoose.model<IEnvelope>('Envelope', EnvelopeSchema);

export default Envelope;
