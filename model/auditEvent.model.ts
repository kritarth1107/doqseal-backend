import mongoose, { Schema, Document } from 'mongoose';

export interface IAuditEvent extends Document {
  actorId: string;
  organisationId: string;
  action: string;
  resourceType: string;
  resourceId: string;
  metadata?: Record<string, unknown> | null;
  timestamp: Date;
}

const AuditEventSchema: Schema = new Schema(
  {
    actorId: {
      type: String,
      required: true,
      index: true,
    },
    organisationId: {
      type: String,
      required: true,
      index: true,
    },
    action: {
      type: String,
      required: true,
      index: true,
    },
    resourceType: {
      type: String,
      required: true,
    },
    resourceId: {
      type: String,
      required: true,
    },
    metadata: {
      type: Schema.Types.Mixed,
      default: null,
    },
    timestamp: {
      type: Date,
      required: true,
      default: Date.now,
      index: true,
    },
  },
  {
    timestamps: false,
    collection: 'audit_events',
  }
);

AuditEventSchema.index({ organisationId: 1, timestamp: -1 });

const AuditEvent = mongoose.model<IAuditEvent>('AuditEvent', AuditEventSchema);

export default AuditEvent;
