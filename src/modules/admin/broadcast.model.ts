import { model, Schema, type Types } from 'mongoose';
import type { BaseDocument } from '../../database/base.repository';

/** Who a broadcast targets. `users` = an explicit list of user ids. */
export enum BroadcastAudience {
  All = 'all',
  Plan = 'plan',
  Country = 'country',
  Users = 'users',
}

export enum BroadcastChannel {
  /** In-app inbox entry + device push (announcements have no per-category opt-out). */
  InboxAndPush = 'inbox_and_push',
  /** Inbox only — no device push. */
  Inbox = 'inbox',
}

/** A message sent to many users from the admin panel, kept as history. */
export interface BroadcastDocument extends BaseDocument {
  _id: Types.ObjectId;
  title: string;
  body: string;
  audience: BroadcastAudience;
  /** The plan / country / user ids the audience was narrowed by. */
  audienceValues: string[];
  channel: BroadcastChannel;
  recipients: number;
  /** Recipients with at least one registered device at send time. */
  pushRecipients: number;
  sentBy: Types.ObjectId;
  sentByName: string;
  createdAt: Date;
  updatedAt: Date;
}

const broadcastSchema = new Schema<BroadcastDocument>(
  {
    title: { type: String, required: true, trim: true },
    body: { type: String, required: true, trim: true },
    audience: { type: String, enum: Object.values(BroadcastAudience), required: true },
    audienceValues: { type: [String], default: [] },
    channel: { type: String, enum: Object.values(BroadcastChannel), required: true },
    recipients: { type: Number, default: 0 },
    pushRecipients: { type: Number, default: 0 },
    sentBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    sentByName: { type: String, required: true, trim: true },
  },
  { timestamps: true, collection: 'admin_broadcasts' },
);

broadcastSchema.index({ createdAt: -1 });

export const BroadcastModel = model<BroadcastDocument>('Broadcast', broadcastSchema);
