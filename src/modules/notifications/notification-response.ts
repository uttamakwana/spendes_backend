import type { NotificationDocument } from './notification.model';
import { NotificationType } from './notifications.enums';

/**
 * The public-facing representation of a notification. Built explicitly via
 * {@link toNotificationResponse} so ObjectIds become strings and the inbox gets a
 * computed `canDispute` flag rather than re-deriving the rule client-side.
 */
export interface NotificationResponse {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  actorName?: string;
  groupId?: string;
  groupExpenseId?: string;
  settlementId?: string;
  isDirect?: boolean;
  amount?: number;
  currency?: string;
  isRead: boolean;
  isDisputed: boolean;
  /** Whether the recipient can still flag this as wrong (open split/inherited only). */
  canDispute: boolean;
  createdAt: Date;
}

/** Notification types the recipient is allowed to dispute (non-blocking pushback). */
const DISPUTABLE = new Set<NotificationType>([
  NotificationType.SplitAdded,
  NotificationType.MembershipInherited,
]);

/** Maps a raw notification document to its public response shape. */
export function toNotificationResponse(n: NotificationDocument): NotificationResponse {
  return {
    id: n._id.toString(),
    type: n.type,
    title: n.title,
    body: n.body,
    actorName: n.actorName,
    groupId: n.groupId?.toString(),
    groupExpenseId: n.groupExpenseId?.toString(),
    settlementId: n.settlementId?.toString(),
    isDirect: n.isDirect,
    amount: n.amount,
    currency: n.currency,
    isRead: n.isRead,
    isDisputed: n.isDisputed,
    canDispute: DISPUTABLE.has(n.type) && !n.isDisputed,
    createdAt: n.createdAt,
  };
}
