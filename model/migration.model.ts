import mongoose, { Schema, Document } from 'mongoose';

export interface IMigration extends Document {
  name: string;
  version: string;
  executedAt: Date;
  durationMs: number;
  status: 'completed' | 'failed';
  error?: string | null;
}

const MigrationSchema: Schema = new Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    version: {
      type: String,
      required: true,
    },
    executedAt: {
      type: Date,
      required: true,
      default: Date.now,
    },
    durationMs: {
      type: Number,
      required: true,
    },
    status: {
      type: String,
      enum: ['completed', 'failed'],
      required: true,
    },
    error: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: false,
    collection: 'migrations',
  }
);

const Migration = mongoose.model<IMigration>('Migration', MigrationSchema);

export default Migration;
