import { type FilterQuery, Types } from 'mongoose';
import { BadRequestException } from '../../common/errors/http-exception';
import { buildSort } from '../../common/utils/pagination';
import { paginate } from '../../common/utils/response';
import type { PaginatedData } from '../../common/types/api-response';
import { createLogger } from '../../logger';
import { MemberConsent } from '../groups/groups.enums';
import { groupsRepository } from '../groups/groups.repository';
import { pushService } from '../push/push.service';
import { resolveNotificationPreferences, type NotificationPreferences } from '../users/users.model';
import { usersService } from '../users/users.service';
import type { NotificationDocument } from './notification.model';
import {
  REVIEWABLE,
  toNotificationResponse,
  type NotificationResponse,
} from './notification-response';
import { DisputeReason, NotificationType } from './notifications.enums';
import { notificationsRepository, NotificationsRepository } from './notifications.repository';
import type { DisputeNotificationInput, ListNotificationsQuery } from './notifications.validation';

/** Notification types the recipient may flag as wrong (non-blocking pushback). */
const DISPUTABLE = new Set<NotificationType>([
  NotificationType.SplitAdded,
  NotificationType.MembershipInherited,
  NotificationType.FriendAdded,
]);

/**
 * Which push-preference category each notification type belongs to. All social
 * activity maps to `splits`; the exhaustive Record forces a decision when a new
 * type is added. Gates the device push only — never the in-app inbox record.
 */
const PUSH_CATEGORY: Record<NotificationType, keyof NotificationPreferences> = {
  [NotificationType.FriendAdded]: 'splits',
  [NotificationType.SplitAdded]: 'splits',
  [NotificationType.SettlementRecorded]: 'splits',
  [NotificationType.SplitDisputed]: 'splits',
  [NotificationType.MembershipInherited]: 'splits',
  [NotificationType.ConnectionConfirmed]: 'splits',
  [NotificationType.ConnectionDeclined]: 'splits',
};

interface FriendAddedInput {
  recipientUserId: string;
  actorName: string;
  actorUserId: string;
  friendshipId: string;
}

interface SplitAddedInput {
  recipientUserId: string;
  actorName: string;
  actorUserId: string;
  description?: string;
  /** The whole bill. */
  amount: number;
  /** The recipient's slice of it — the number they actually care about. */
  shareAmount?: number;
  currency: string;
  groupId: string;
  groupExpenseId: string;
  isDirect: boolean;
  groupName?: string;
}

interface SettlementInput {
  recipientUserId: string;
  actorName: string;
  actorUserId: string;
  amount: number;
  currency: string;
  groupId: string;
  settlementId: string;
  isDirect: boolean;
}

interface ConnectionAnswerInput {
  /** Whoever started it — the person being told how their invite/split landed. */
  recipientUserId: string;
  /** Who answered. */
  actorName: string;
  actorUserId: string;
  groupId: string;
  isDirect: boolean;
  groupExpenseId?: string;
  amount?: number;
  currency?: string;
}

interface MembershipInheritedInput {
  recipientUserId: string;
  otherName?: string;
  groupName: string;
  groupId: string;
  isDirect: boolean;
}

/**
 * In-app notifications: the activity inbox plus the best-effort emitters the social
 * engine calls. Splits and friendships are deliberately frictionless (they take
 * effect at once), so this layer is how the other party stays *aware* and can push
 * back — without ever blocking the originating action. Every emitter swallows its
 * own errors: a failed notification must never fail an add-friend / add-split /
 * settle. Read/dispute operations are owner-scoped (a user only ever sees and acts
 * on their own inbox).
 */
export class NotificationsService {
  private readonly logger = createLogger('NotificationsService');

  constructor(private readonly repository: NotificationsRepository) {}

  // --- Inbox reads -----------------------------------------------------------

  async list(
    userId: string,
    query: ListNotificationsQuery,
  ): Promise<PaginatedData<NotificationResponse>> {
    const filter: FilterQuery<NotificationDocument> = { userId: new Types.ObjectId(userId) };
    if (query.unreadOnly) {
      filter.isRead = false;
    }

    const result = await this.repository.paginate({
      filter,
      page: query.page,
      limit: query.limit,
      sort: buildSort(query) ?? { createdAt: -1 },
    });

    return paginate(result.items.map(toNotificationResponse), {
      page: result.page,
      limit: result.limit,
      totalItems: result.totalItems,
    });
  }

  async unreadCount(userId: string): Promise<{ count: number }> {
    return { count: await this.repository.countUnread(userId) };
  }

  async markRead(userId: string, id: string): Promise<NotificationResponse> {
    return toNotificationResponse(await this.repository.markRead(id, userId));
  }

  async markAllRead(userId: string): Promise<{ updated: number }> {
    return { updated: await this.repository.markAllRead(userId) };
  }

  /**
   * The recipient's "looks right" — the light half of consent. It answers *this*
   * item and, because you can't agree with a split from someone you don't know,
   * also confirms the underlying connection (and any "X added you" rows for it).
   *
   * Individual splits stay separately reviewable on purpose: agreeing that you know
   * someone is not agreeing to every amount they will ever enter.
   */
  async confirm(userId: string, id: string): Promise<NotificationResponse> {
    const notification = await this.repository.findOwnedByIdOrThrow(id, userId);
    if (!REVIEWABLE.has(notification.type)) {
      throw new BadRequestException('There is nothing to confirm on this notification');
    }
    if (notification.isDisputed) {
      throw new BadRequestException('You already flagged this as wrong');
    }
    if (notification.isConfirmed) {
      return toNotificationResponse(notification);
    }

    const updated = await this.repository.markConfirmed(id, userId);
    await this.acceptConnection(userId, notification.groupId?.toString());

    if (notification.actorUserId && notification.groupId) {
      await this.notifyConnectionConfirmed({
        recipientUserId: notification.actorUserId.toString(),
        actorName: await this.resolveName(userId),
        actorUserId: userId,
        groupId: notification.groupId.toString(),
        isDirect: notification.isDirect ?? false,
        forSplit: notification.type === NotificationType.SplitAdded,
        groupExpenseId: notification.groupExpenseId?.toString(),
        amount: notification.amount,
        currency: notification.currency,
      });
    }

    return toNotificationResponse(updated);
  }

  /**
   * Flags a split/friendship the recipient believes is wrong. This is non-blocking
   * pushback: nothing is deleted — whoever added it is told, with the reason, so
   * they can correct or remove it. `DontKnowThem` additionally declines the
   * connection, since that reason is usually a mistyped phone number.
   * Idempotent guard prevents double flagging.
   */
  async dispute(
    userId: string,
    id: string,
    input: DisputeNotificationInput = {},
  ): Promise<NotificationResponse> {
    const notification = await this.repository.findOwnedByIdOrThrow(id, userId);
    if (!DISPUTABLE.has(notification.type)) {
      throw new BadRequestException('This notification cannot be flagged');
    }
    if (notification.isDisputed) {
      throw new BadRequestException('You already flagged this');
    }

    const reason =
      input.reason ??
      (notification.type === NotificationType.FriendAdded ? DisputeReason.DontKnowThem : undefined);
    const rejectsPerson = reason === DisputeReason.DontKnowThem;

    const updated = await this.repository.markDisputed(id, userId, reason, input.note);

    if (rejectsPerson && notification.groupId) {
      await this.setConsent(userId, notification.groupId.toString(), MemberConsent.Declined);
    }

    // Tell whoever added it, with enough detail to act on.
    if (notification.actorUserId) {
      const disputerName = await this.resolveName(userId);
      await this.emit({
        userId: notification.actorUserId,
        type: rejectsPerson ? NotificationType.ConnectionDeclined : NotificationType.SplitDisputed,
        title: rejectsPerson ? 'Not recognised' : 'Split flagged',
        body: rejectsPerson
          ? this.declinedBody(disputerName, input.note)
          : this.disputeBody(disputerName, notification, reason, input.note),
        actorName: disputerName,
        actorUserId: new Types.ObjectId(userId),
        groupId: notification.groupId,
        groupExpenseId: notification.groupExpenseId,
        isDirect: notification.isDirect,
        amount: notification.amount,
        currency: notification.currency,
      });
    }

    return toNotificationResponse(updated);
  }

  /**
   * Marks the connection-level inbox rows for a group as answered. Called when
   * consent is given somewhere else (the friend screen, or by paying), so the same
   * question is never asked twice in two places.
   */
  async markConnectionConfirmed(userId: string, groupId: string): Promise<void> {
    try {
      await this.repository.confirmConnectionItems(userId, groupId);
    } catch (error) {
      this.logger.warn(`Failed to confirm connection items: ${(error as Error).message}`);
    }
  }

  // --- Emitters (best-effort; called by the social engine) -------------------

  async notifyFriendAdded(input: FriendAddedInput): Promise<void> {
    await this.emit({
      userId: new Types.ObjectId(input.recipientUserId),
      type: NotificationType.FriendAdded,
      title: 'New friend',
      body: `${input.actorName} added you as a friend on Spendes.`,
      actorName: input.actorName,
      actorUserId: new Types.ObjectId(input.actorUserId),
      groupId: new Types.ObjectId(input.friendshipId),
      isDirect: true,
    });
  }

  async notifySplitAdded(input: SplitAddedInput): Promise<void> {
    const money = this.formatAmount(input.amount, input.currency);
    const forWhat = input.description ? ` for “${input.description}”` : '';

    // Adding a friend and immediately splitting with them is one action to the
    // person doing it, so it should be one row to the person receiving it. If an
    // untouched "X added you as a friend" is still sitting there, this supersedes it.
    const supersededFriendAdd =
      input.isDirect &&
      (await this.repository
        .deleteUnactionedFriendAdd(input.recipientUserId, input.groupId)
        .catch(() => 0)) > 0;

    const opener = supersededFriendAdd
      ? `${input.actorName} added you on Spendes and split ${money} with you${forWhat}`
      : input.isDirect
        ? `${input.actorName} added a ${money} split with you${forWhat}`
        : `${input.actorName} added you to a ${money} split${forWhat}${
            input.groupName ? ` in ${input.groupName}` : ''
          }`;

    // Lead with their share when it isn't simply the whole bill — that's the number
    // they're being asked about.
    const share =
      input.shareAmount !== undefined && input.shareAmount !== input.amount
        ? ` — your share is ${this.formatAmount(input.shareAmount, input.currency)}`
        : '';

    await this.emit({
      userId: new Types.ObjectId(input.recipientUserId),
      type: NotificationType.SplitAdded,
      title: 'New split',
      body: `${opener}${share}.`,
      actorName: input.actorName,
      actorUserId: new Types.ObjectId(input.actorUserId),
      groupId: new Types.ObjectId(input.groupId),
      groupExpenseId: new Types.ObjectId(input.groupExpenseId),
      isDirect: input.isDirect,
      amount: input.amount,
      currency: input.currency,
    });
  }

  async notifySettlement(input: SettlementInput): Promise<void> {
    const money = this.formatAmount(input.amount, input.currency);
    await this.emit({
      userId: new Types.ObjectId(input.recipientUserId),
      type: NotificationType.SettlementRecorded,
      title: 'Payment recorded',
      body: `${input.actorName} recorded a ${money} settlement with you.`,
      actorName: input.actorName,
      actorUserId: new Types.ObjectId(input.actorUserId),
      groupId: new Types.ObjectId(input.groupId),
      settlementId: new Types.ObjectId(input.settlementId),
      isDirect: input.isDirect,
      amount: input.amount,
      currency: input.currency,
    });
  }

  /**
   * Closes the loop for whoever added someone: they confirmed you, or the split.
   * Emitted from the inbox review screen and from the friend screen alike.
   */
  async notifyConnectionConfirmed(
    input: ConnectionAnswerInput & { forSplit?: boolean },
  ): Promise<void> {
    const money =
      input.amount !== undefined
        ? ` ${this.formatAmount(input.amount, input.currency ?? 'INR')}`
        : '';

    await this.emit({
      userId: new Types.ObjectId(input.recipientUserId),
      type: NotificationType.ConnectionConfirmed,
      title: input.forSplit ? 'Split confirmed' : 'Confirmed',
      body: input.forSplit
        ? `${input.actorName} confirmed the${money} split you added.`
        : `${input.actorName} confirmed you on Spendes.`,
      actorName: input.actorName,
      actorUserId: new Types.ObjectId(input.actorUserId),
      groupId: new Types.ObjectId(input.groupId),
      groupExpenseId: input.groupExpenseId ? new Types.ObjectId(input.groupExpenseId) : undefined,
      isDirect: input.isDirect,
      amount: input.amount,
      currency: input.currency,
    });
  }

  /**
   * The other answer: they don't recognise the person who added them. Usually a
   * mistyped phone number, so the copy points at that rather than at the split.
   */
  async notifyConnectionDeclined(input: ConnectionAnswerInput & { note?: string }): Promise<void> {
    await this.emit({
      userId: new Types.ObjectId(input.recipientUserId),
      type: NotificationType.ConnectionDeclined,
      title: 'Not recognised',
      body: this.declinedBody(input.actorName, input.note),
      actorName: input.actorName,
      actorUserId: new Types.ObjectId(input.actorUserId),
      groupId: new Types.ObjectId(input.groupId),
      isDirect: input.isDirect,
    });
  }

  async notifyMembershipInherited(input: MembershipInheritedInput): Promise<void> {
    const body = input.isDirect
      ? `You and ${input.otherName ?? 'a friend'} have shared expenses from before you joined. Review or flag them.`
      : `You were added to “${input.groupName}” before you joined. Review the shared expenses or flag them.`;

    await this.emit({
      userId: new Types.ObjectId(input.recipientUserId),
      type: NotificationType.MembershipInherited,
      title: input.isDirect ? 'Shared expenses' : 'Added to a group',
      body,
      actorName: input.otherName,
      groupId: new Types.ObjectId(input.groupId),
      isDirect: input.isDirect,
    });
  }

  // --- Internals -------------------------------------------------------------

  /** Confirms the connection behind a reviewed item: the membership and its inbox rows. */
  private async acceptConnection(userId: string, groupId?: string): Promise<void> {
    if (!groupId) return;
    await this.setConsent(userId, groupId, MemberConsent.Confirmed);
    await this.markConnectionConfirmed(userId, groupId);
  }

  /** Writes a consent answer, best-effort — it must never fail the inbox action. */
  private async setConsent(userId: string, groupId: string, consent: MemberConsent): Promise<void> {
    try {
      await groupsRepository.setMemberConsent(groupId, userId, consent);
    } catch (error) {
      this.logger.warn(`Failed to set membership consent: ${(error as Error).message}`);
    }
  }

  /** Reply copy for a flagged split — the reason is what makes it actionable. */
  private disputeBody(
    name: string,
    notification: NotificationDocument,
    reason?: DisputeReason,
    note?: string,
  ): string {
    const what = notification.groupExpenseId ? 'the split you added' : 'what you added';
    const money =
      notification.amount !== undefined
        ? ` (${this.formatAmount(notification.amount, notification.currency ?? 'INR')})`
        : '';

    const headline = ((): string => {
      switch (reason) {
        case DisputeReason.NotMine:
          return `${name} says they weren't part of ${what}${money}.`;
        case DisputeReason.WrongAmount:
          return `${name} says the amount on ${what}${money} isn't right.`;
        case DisputeReason.AlreadyPaid:
          return `${name} says they already paid you for ${what}${money}.`;
        default:
          return `${name} flagged ${what}${money}. Tap to review it.`;
      }
    })();

    return note ? `${headline} “${note}”` : headline;
  }

  /** Reply copy for "I don't recognise this person". */
  private declinedBody(name: string, note?: string): string {
    const headline = `${name} doesn't recognise you — check you used the right number.`;
    return note ? `${headline} “${note}”` : headline;
  }

  /**
   * Persists a notification, swallowing and logging any error (never throws),
   * then surfaces it as a device push. The push is fire-and-forget: it never
   * blocks or fails the in-app write, which remains the inbox's source of truth.
   * The `data` payload mirrors the inbox's deep-link routing so a tap lands on
   * the same group/friend screen.
   */
  private async emit(doc: Partial<Omit<NotificationDocument, '_id'>>): Promise<void> {
    try {
      const created = await this.repository.create(doc);
      // The inbox record above is always written; the device push respects the
      // recipient's per-category opt-out.
      if (await this.pushAllowed(created.userId.toString(), created.type)) {
        void pushService.sendToUser(created.userId.toString(), {
          title: created.title,
          body: created.body,
          data: {
            type: created.type,
            notificationId: created._id.toString(),
            groupId: created.groupId?.toString(),
            isDirect: created.isDirect ?? false,
          },
        });
      }
    } catch (error) {
      this.logger.warn(`Failed to create notification: ${(error as Error).message}`);
    }
  }

  /** Whether the recipient still wants a *device push* for this category. Inbox is unaffected. */
  private async pushAllowed(userId: string, type: NotificationType): Promise<boolean> {
    try {
      const user = await usersService.findEntityById(userId);
      return resolveNotificationPreferences(user?.notificationPreferences)[PUSH_CATEGORY[type]];
    } catch {
      // A preference lookup must never suppress delivery on its own failure.
      return true;
    }
  }

  /** The display name for a user id, or a safe fallback. */
  private async resolveName(userId: string): Promise<string> {
    try {
      const user = await usersService.findEntityById(userId);
      if (user) {
        return `${user.firstName} ${user.lastName}`.trim() || 'Someone';
      }
    } catch {
      // ignore — fall through to the default
    }
    return 'Someone';
  }

  /** Renders an amount for notification copy (₹ for INR, code suffix otherwise). */
  private formatAmount(amount: number, currency: string): string {
    const value = Math.round(amount).toLocaleString('en-IN');
    return currency === 'INR' ? `₹${value}` : `${value} ${currency}`;
  }
}

/** Shared singleton instance used across the app. */
export const notificationsService = new NotificationsService(notificationsRepository);
