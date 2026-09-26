import mongoose, { Schema, Document } from 'mongoose';

/** A user's chat conversation. Always read with BOTH organisationId and userId. */
export interface IChatConversation extends Document {
  conversationId: string;
  organisationId: string;
  userId: string;
  projectId?: string | null;
  title: string;
  messageCount: number;
  lastMessageAt: Date;
  deletedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const ChatConversationSchema: Schema = new Schema(
  {
    conversationId: { type: String, required: true, unique: true },
    organisationId: { type: String, required: true },
    userId: { type: String, required: true },
    projectId: { type: String, default: null },
    title: { type: String, required: true, maxlength: 200 },
    messageCount: { type: Number, default: 0 },
    lastMessageAt: { type: Date, default: Date.now },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true, collection: 'chat_conversations' }
);

ChatConversationSchema.index({ organisationId: 1, userId: 1, deletedAt: 1 });
// Single-field index so sorting works on Cosmos DB's Mongo API.
ChatConversationSchema.index({ lastMessageAt: -1 });

const ChatConversation = mongoose.model<IChatConversation>('ChatConversation', ChatConversationSchema);

export default ChatConversation;
