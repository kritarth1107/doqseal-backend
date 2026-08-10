import mongoose, { Schema, Document } from 'mongoose';

/**
 * Membership Interface for TypeScript
 */
export interface IMembership extends Document {
  userId: string;
  organisationId: mongoose.Types.ObjectId;
  role: string;
  deletedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Membership Schema - Links Users and Organisations
 */
const MembershipSchema: Schema = new Schema(
  {
    userId: {
      type: String, // Linking by the business userId string
      required: true,
      index: true,
    },
    organisationId: {
      type: Schema.Types.ObjectId,
      ref: 'Organisation',
      required: true,
      index: true,
    },
    role: {
      type: String,
      default: 'member',
      enum: ['owner', 'admin', 'member'],
    },
    deletedAt: {
      type: Date,
      default: null,
      index: true,
    },
  },
  {
    timestamps: true,
    collection: 'memberships',
    toJSON: {
      transform: (_, ret: any) => {
        delete ret.__v;
        return ret;
      },
    },
  }
);

// ===== INDEXES =====
// Ensure unique membership per user per organisation
MembershipSchema.index({ userId: 1, organisationId: 1, deletedAt: 1 }, { unique: true });
MembershipSchema.index({ organisationId: 1, deletedAt: 1 });
MembershipSchema.index({ userId: 1, deletedAt: 1 });

/**
 * Membership Model
 */
const Membership = mongoose.model<IMembership>('Membership', MembershipSchema);

export default Membership;
