import mongoose, { Schema, Document } from 'mongoose';

/**
 * User Interface for TypeScript
 */
export interface IUser extends Document {
  userId: string;
  name: string;
  email: string;
  avatar?: string;
  organisations?: {
    organisationId: string;
    role: string;
  }[];
  onboardingCompleted: boolean;
  onboarding?: {
    usageIntent?: 'individual' | 'team';
    jobRole?: string;
    useCases?: string[];
    completedAt?: Date;
  };
  lastLoginAt?: Date;
  lastLoginData?: any;
  connectSocials?: any;
  deletedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * User Schema optimized for high-performance and scalability
 * Handles millions of records with strategic indexing
 */
const UserSchema: Schema = new Schema(
  {
    userId: {
      type: String,
      unique: true,
      required: true,
      index: true,
      comment: 'Unique business ID for the user (e.g., UUID)',
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      unique: true,
      required: true,
      trim: true,
      lowercase: true,
      index: true,
    },
    avatar: {
      type: String,
      default: null,
    },
    organisations: [
      {
        organisationId: { type: String, required: true },
        role: { type: String, required: true },
      },
    ],
    onboardingCompleted: {
      type: Boolean,
      default: false,
      index: true,
    },
    onboarding: {
      usageIntent: {
        type: String,
        enum: ['individual', 'team'],
        default: undefined,
      },
      jobRole: { type: String, default: null },
      useCases: { type: [String], default: [] },
      completedAt: { type: Date, default: null },
    },

    lastLoginAt: {
      type: Date,
      index: true,
    },
    lastLoginData: {
      type: Schema.Types.Mixed,
      default: {},
    },
    connectSocials: {
      type: Schema.Types.Mixed,
      default: {},
    },
    deletedAt: {
      type: Date,
      default: null,
      index: true,
    },
  },
  {
    timestamps: true,
    collection: 'users',
    toJSON: {
      transform: (_, ret: any) => {
        delete ret.__v;
        return ret;
      },
    },
  }
);

// ===== INDEXES FOR MILLIONS OF DATA =====
// Compound indexes for common queries
UserSchema.index({ organisationId: 1, deletedAt: 1 });
UserSchema.index({ email: 1, deletedAt: 1 });
UserSchema.index({ userId: 1, deletedAt: 1 });

/**
 * User Model
 */
const User = mongoose.model<IUser>('User', UserSchema);

export default User;
