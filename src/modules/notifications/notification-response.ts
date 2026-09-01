import type { MemberConsent } from '../groups/groups.enums';
import type { SplitStrategy } from '../splits/splits.enums';
import type { NotificationDocument } from './notification.model';
import { DisputeReason, NotificationType } from './notifications.enums';

/**
 * The public-facing representation of a notification. Built explicitly via
 * {@link toNotificationResponse} so ObjectIds become strings and the inbox gets the
 * computed `canConfirm`/`canDispute` flags rather than re-deriving the rules
 * client-side.
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
  isConfirmed: boolean;
  isDisputed: boolean;
  disputeReason?: DisputeReason;
  disputeNote?: string;
  /** Whether this item still asks something of the recipient (drives the "Review" cue). */
  needsReview: boolean;
  /** Whether the recipient can still answer "looks right". */
  canConfirm: boolean;
  /** Whether the recipient can still flag this as wrong (open split/inherited only). */
  canDispute: boolean;
  createdAt: Date;
}

/** Notification types that ask the recipient to review something, not just read it. */
export const REVIEWABLE = new Set<NotificationType>([
  NotificationType.FriendAdded,
  NotificationType.SplitAdded,
  NotificationType.MembershipInherited,
]);

/** Notification types the recipient is allowed to dispute (non-blocking pushback). */
const DISPUTABLE = new Set<NotificationType>([
  NotificationType.SplitAdded,
  NotificationType.MembershipInherited,
  NotificationType.FriendAdded,
]);

/** Maps a raw notification document to its public response shape. */
export function toNotificationResponse(n: NotificationDocument): NotificationResponse {
  const answered = n.isConfirmed || n.isDisputed;
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
    isConfirmed: n.isConfirmed ?? false,
    isDisputed: n.isDisputed,
    disputeReason: n.disputeReason,
    disputeNote: n.disputeNote,
    needsReview: REVIEWABLE.has(n.type) && !answered,
    canConfirm: REVIEWABLE.has(n.type) && !answered,
    canDispute: DISPUTABLE.has(n.type) && !n.isDisputed,
    createdAt: n.createdAt,
  };
}

// --- Review detail ----------------------------------------------------------

/** Who triggered the notification — enough for the recipient to actually recognise them. */
export interface NotificationActorSummary {
  userId?: string;
  name: string;
  avatarUrl?: string;
  dialCode?: string;
  phoneNumber?: string;
  isRegistered: boolean;
}

/** The group/friendship the notification is about, from the recipient's side. */
export interface NotificationConnectionSummary {
  id: string;
  isDirect: boolean;
  name: string;
  /** The *recipient's* consent — pending means "they added you, you haven't answered". */
  consent: MemberConsent;
  /** True when someone else created this connection (i.e. it arrived unasked-for). */
  addedByThem: boolean;
  memberCount: number;
  myMemberId?: string;
  /** The other party's member id in a direct friendship (the settle-up target). */
  otherMemberId?: string;
  createdAt: Date;
}

/** The split being reviewed, reduced to the four numbers that answer "is this right?". */
export interface NotificationExpenseSummary {
  id: string;
  description: string;
  /** The full bill. */
  amount: number;
  currency: string;
  /** The recipient's slice of it — the number that actually matters to them. */
  myShare: number;
  paidByName: string;
  splitStrategy: SplitStrategy;
  splitCount: number;
  category?: string;
  notes?: string;
  spentAt: Date;
}

/** The recipient's running position in this group/friendship. */
export interface NotificationBalanceSummary {
  /** Positive = they're owed; negative = they owe. Major units. */
  myNet: number;
  currency: string;
}

/**
 * What the recipient can actually do from the review screen, decided server-side so
 * the client never offers a button that will fail (e.g. UPI with no payee VPA).
 */
export interface NotificationActions {
  canConfirm: boolean;
  canDispute: boolean;
  /** Pay over UPI — only when they owe something and the payee has a VPA on file. */
  canPay: boolean;
  /** Record a payment made outside the app — only when they owe something. */
  canMarkPaid: boolean;
  /** How much they'd settle, in major units (0 when nothing is owed). */
  payAmount: number;
  payeeMemberId?: string;
  payerMemberId?: string;
  /** The payee's rail ("UPI", "PayPal", "Venmo"), for the Pay button's copy. */
  payRailLabel?: string;
  /** Set when there's no rail we can open, so the UI can say why. */
  payBlockedReason?: string;
}

/** `GET /notifications/:id` — the notification plus everything the review screen shows. */
export interface NotificationDetailResponse extends NotificationResponse {
  actor?: NotificationActorSummary;
  connection?: NotificationConnectionSummary;
  expense?: NotificationExpenseSummary;
  balance?: NotificationBalanceSummary;
  actions: NotificationActions;
}
