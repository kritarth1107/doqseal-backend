import mongoose, { Schema, Document } from 'mongoose';

export interface IBillingInvoice extends Document {
  invoiceId: string;
  organisationId: string;
  subscriptionId?: string | null;
  planId?: string | null;
  date: string;
  totalInr: number;
  status: 'paid' | 'pending' | 'failed';
  description: string;
  cashfreePaymentId?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const BillingInvoiceSchema: Schema = new Schema(
  {
    invoiceId: {
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
    subscriptionId: {
      type: String,
      default: null,
      index: true,
    },
    planId: {
      type: String,
      default: null,
    },
    date: {
      type: String,
      required: true,
      index: true,
    },
    totalInr: {
      type: Number,
      required: true,
    },
    status: {
      type: String,
      enum: ['paid', 'pending', 'failed'],
      default: 'paid',
    },
    description: {
      type: String,
      default: '',
    },
    cashfreePaymentId: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true,
    collection: 'billing_invoices',
  }
);

BillingInvoiceSchema.index({ organisationId: 1, date: -1 });

const BillingInvoice = mongoose.model<IBillingInvoice>(
  'BillingInvoice',
  BillingInvoiceSchema
);

export default BillingInvoice;
