import mongoose, { Schema, Document } from 'mongoose';

export interface ChatCitation {
  n: number;
  documentId: string;
  title?: string | null;
  page?: number | null;
  quote?: string | null;
}

export interface ChatStep {
  id?: string;
  name: string;
  status: string;
  label?: string;
  detail?: Record<string, unknown> | null;
}

/** One turn of a conversation. Always read with BOTH organisationId and userId. */
export interface IChatMessage extends Document {
  messageId: string;
  conversationId: string;
  organisationId: string;
  userId: string;
  role: 'user' | 'assistant';
  content: string;
  citations: ChatCitation[];
  steps: ChatStep[];
  /** answered | partial | declined | error | aborted (assistant turns); null for user turns. */
  mode?: string | null;
  usage?: Record<string, number> | null;
  latencyMs?: number | null;
  createdAt: Date;
}

const ChatMessageSchema: Schema = new Schema(
  {
    messageId: { type: String, required: true, unique: true },
    conversationId: { type: String, required: true },
    organisationId: { type: String, required: true },
    userId: { type: String, required: true },
    role: { type: String, enum: ['user', 'assistant'], required: true },
    content: { type: String, default: '' },
    citations: { type: [Schema.Types.Mixed], default: [] },
    steps: { type: [Schema.Types.Mixed], default: [] },
    mode: { type: String, default: null },
    usage: { type: Schema.Types.Mixed, default: null },
    latencyMs: { type: Number, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false }, collection: 'chat_messages' }
);

ChatMessageSchema.index({ organisationId: 1, userId: 1, conversationId: 1 });
// Single-field index so sorting works on Cosmos DB's Mongo API.
ChatMessageSchema.index({ createdAt: 1 });

const ChatMessage = mongoose.model<IChatMessage>('ChatMessage', ChatMessageSchema);

export default ChatMessage;
