import mongoose, { Schema, Document } from 'mongoose';

/**
 * Organisation Interface for TypeScript
 */
export interface IOrganisation extends Document {
  publicId?: string;
  name: string;
  slug: string;
  planDetails?: any;
  memberCount: number;
  logoUrl?: string;
  website?: string;
  /** Verified email domain for auto-join (e.g. acme.com) */
  verifiedDomain?: string | null;
  /** Domain awaiting DNS verification */
  pendingDomain?: string | null;
  /** TXT verification token — proves domain ownership */
  domainVerificationToken?: string | null;
  domainVerifiedAt?: Date | null;
  isDomainVerified: boolean;
  /** When true, users with matching verified email domain auto-join on login */
  autoJoinDomain: boolean;
  isActive: boolean;
  /** Demo workspace — canned TRF extraction, fixed OTP login */
  isDemo?: boolean;
  /** Organisation-wide webhook endpoint(s) — configured in API management */
  webhooks?: {
    url: string;
    events: string[];
    enabled?: boolean;
  }[];

  deletedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Organisation Schema optimized for scalability
 */
const OrganisationSchema: Schema = new Schema(
  {
    publicId: {
      type: String,
      unique: true,
      sparse: true,
      index: true,
      comment: 'Public ID for external references',
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    slug: {
      type: String,
      unique: true,
      required: true,
      trim: true,
      lowercase: true,
      index: true,
    },
    planDetails: {
      type: Schema.Types.Mixed,
      default: {},
    },
    memberCount: {
      type: Number,
      default: 0,
    },
    logoUrl: {
      type: String,
      default: null,
    },
    website: {
      type: String,
      default: null,
    },
    verifiedDomain: {
      type: String,
      default: null,
      index: true,
      sparse: true,
    },
    pendingDomain: {
      type: String,
      default: null,
    },
    domainVerificationToken: {
      type: String,
      default: null,
    },
    domainVerifiedAt: {
      type: Date,
      default: null,
    },
    isDomainVerified: {
      type: Boolean,
      default: false,
    },
    autoJoinDomain: {
      type: Boolean,
      default: false,
    },

    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    isDemo: {
      type: Boolean,
      default: false,
      index: true,
    },
    webhooks: {
      type: [
        {
          url: { type: String, required: true },
          events: { type: [String], default: ['document.processed'] },
          enabled: { type: Boolean, default: true },
        },
      ],
      default: [],
    },
    deletedAt: {
      type: Date,
      default: null,
      index: true,
    },
  },
  {
    timestamps: true,
    collection: 'organisations',
    toJSON: {
      transform: (_, ret: any) => {
        delete ret.__v;
        return ret;
      },
    },
  }
);

// ===== INDEXES =====
OrganisationSchema.index({ slug: 1, deletedAt: 1 });
OrganisationSchema.index({ isActive: 1, deletedAt: 1 });
OrganisationSchema.index(
  { verifiedDomain: 1, isDomainVerified: 1 },
  {
    unique: true,
    partialFilterExpression: {
      isDomainVerified: true,
      verifiedDomain: { $type: 'string' },
      deletedAt: null,
    },
  }
);

/**
 * Organisation Model
 */
const Organisation = mongoose.model<IOrganisation>('Organisation', OrganisationSchema);

export default Organisation;
