import mongoose, { Schema, Document } from 'mongoose';

export type SubscriptionStatus =
  | 'initialized'
  | 'bank_approval_pending'
  | 'active'
  | 'on_hold'
  | 'paused'
  | 'cancelled'
  | 'completed'
  | 'expired'
  | 'failed';

export type SavedPaymentMethod = {
  type: 'card' | 'upi' | 'enach' | 'pnach' | 'unknown';
  brand: string;
  last4: string;
  expiryMonth?: number | null;
  expiryYear?: number | null;
  umn?: string | null;
  instrumentId?: string | null;
};

export interface IOrganisationSubscription extends Document {
  subscriptionId: string;
  organisationId: string;
  userId: string;
  planId: string;
  paymentProvider?: 'cashfree' | 'razorpay';
  cashfreeSubscriptionId: string;
  cashfreeCfSubscriptionId?: string | null;
  status: SubscriptionStatus;
  amountInr: number;
  currency: string;
  customerPhone: string;
  paymentMethod?: SavedPaymentMethod | null;
  currentPeriodEnd?: Date | null;
  nextChargeAt?: Date | null;
  activatedAt?: Date | null;
  cancelledAt?: Date | null;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

const PaymentMethodSchema = new Schema(
  {
    type: {
      type: String,
      enum: ['card', 'upi', 'enach', 'pnach', 'unknown'],
      default: 'unknown',
    },
    brand: { type: String, default: '' },
    last4: { type: String, default: '' },
    expiryMonth: { type: Number, default: null },
    expiryYear: { type: Number, default: null },
    umn: { type: String, default: null },
    instrumentId: { type: String, default: null },
  },
  { _id: false }
);

const OrganisationSubscriptionSchema: Schema = new Schema(
  {
    subscriptionId: {
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
    userId: {
      type: String,
      required: true,
      index: true,
    },
    planId: {
      type: String,
      required: true,
      index: true,
    },
    paymentProvider: {
      type: String,
      enum: ['cashfree', 'razorpay'],
      default: 'cashfree',
      index: true,
    },
    cashfreeSubscriptionId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    cashfreeCfSubscriptionId: {
      type: String,
      default: null,
    },
    status: {
      type: String,
      enum: [
        'initialized',
        'bank_approval_pending',
        'active',
        'on_hold',
        'paused',
        'cancelled',
        'completed',
        'expired',
        'failed',
      ],
      default: 'initialized',
      index: true,
    },
    amountInr: {
      type: Number,
      required: true,
    },
    currency: {
      type: String,
      default: 'INR',
    },
    customerPhone: {
      type: String,
      required: true,
    },
    paymentMethod: {
      type: PaymentMethodSchema,
      default: null,
    },
    currentPeriodEnd: {
      type: Date,
      default: null,
    },
    nextChargeAt: {
      type: Date,
      default: null,
    },
    activatedAt: {
      type: Date,
      default: null,
    },
    cancelledAt: {
      type: Date,
      default: null,
    },
    metadata: {
      type: Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
    collection: 'organisation_subscriptions',
  }
);

OrganisationSubscriptionSchema.index({ organisationId: 1, status: 1 });

const OrganisationSubscription = mongoose.model<IOrganisationSubscription>(
  'OrganisationSubscription',
  OrganisationSubscriptionSchema
);

export default OrganisationSubscription;
