import { model, Schema, type Types } from 'mongoose';
import type { BaseDocument } from '../../database/base.repository';
import { NotificationType } from './notifications.enums';

/**
 * A single in-app notification delivered to exactly one recipient (`userId`). The
 * row is self-contained — `title`/`body` are rendered as stored — but also carries
 * the references needed to deep-link the inbox into the relevant group/friend/
 * expense and to drive the dispute action. `userId` scopes every read and write.
 *
 * Notifications are best-effort side effects of the social engine: their creation
 * never blocks or fails the originating action (add friend, add split, settle).
 */
export interface NotificationDocument extends BaseDocument {
  _id: Types.ObjectId;
  /** Recipient — the user who sees this in their inbox. */
  userId: Types.ObjectId;
  type: NotificationType;
  title: string;
  body: string;
  /** Display name of whoever triggered it (denormalized for rendering). */
  actorName?: string;
  actorUserId?: Types.ObjectId;
  /** Deep-link targets. A `Direct` group is surfaced as a friend (see `isDirect`). */
  groupId?: Types.ObjectId;
  groupExpenseId?: Types.ObjectId;
  settlementId?: Types.ObjectId;
  /** True when `groupId` is a 1-on-1 friendship, so the inbox links to /friends. */
  isDirect?: boolean;
  amount?: number;
  currency?: string;
  isRead: boolean;
  /** Set when the recipient flagged a `SplitAdded`/`MembershipInherited` as wrong. */
  isDisputed: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const notificationSchema = new Schema<NotificationDocument>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    type: { type: String, enum: Object.values(NotificationType), required: true },
    title: { type: String, required: true, trim: true },
    body: { type: String, required: true, trim: true },
    actorName: { type: String, trim: true },
    actorUserId: { type: Schema.Types.ObjectId, ref: 'User' },
    groupId: { type: Schema.Types.ObjectId, ref: 'Group' },
    groupExpenseId: { type: Schema.Types.ObjectId, ref: 'GroupExpense' },
    settlementId: { type: Schema.Types.ObjectId, ref: 'Settlement' },
    isDirect: { type: Boolean },
    amount: { type: Number, min: 0 },
    currency: { type: String, uppercase: true, trim: true },
    isRead: { type: Boolean, default: false },
    isDisputed: { type: Boolean, default: false },
  },
  { timestamps: true, collection: 'notifications' },
);

// The primary access pattern: a user's notifications, newest first.
notificationSchema.index({ userId: 1, createdAt: -1 });

// Fast unread-count / unread-only listing.
notificationSchema.index({ userId: 1, isRead: 1 });

export const NotificationModel = model<NotificationDocument>('Notification', notificationSchema);
