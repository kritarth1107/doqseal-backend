import mongoose, { Schema, Document } from 'mongoose';

export type InviteStatus = 'pending' | 'accepted' | 'revoked';

export interface IOrganisationInvite extends Document {
  email: string;
  organisationId: mongoose.Types.ObjectId;
  role: 'owner' | 'admin' | 'member';
  token: string;
  invitedBy: string;
  expiresAt: Date;
  status: InviteStatus;
  createdAt: Date;
  updatedAt: Date;
}

const OrganisationInviteSchema: Schema = new Schema(
  {
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
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
      enum: ['owner', 'admin', 'member'],
      default: 'member',
    },
    token: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    invitedBy: {
      type: String,
      required: true,
    },
    expiresAt: {
      type: Date,
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ['pending', 'accepted', 'revoked'],
      default: 'pending',
      index: true,
    },
  },
  {
    timestamps: true,
    collection: 'organisation_invites',
    toJSON: {
      transform: (_, ret: any) => {
        delete ret.__v;
        return ret;
      },
    },
  }
);

OrganisationInviteSchema.index({ organisationId: 1, status: 1 });
OrganisationInviteSchema.index({ email: 1, organisationId: 1, status: 1 });

const OrganisationInvite = mongoose.model<IOrganisationInvite>(
  'OrganisationInvite',
  OrganisationInviteSchema
);

export default OrganisationInvite;
