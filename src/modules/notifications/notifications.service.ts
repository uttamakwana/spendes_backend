import { type FilterQuery, Types } from 'mongoose';
import { BadRequestException } from '../../common/errors/http-exception';
import { buildSort } from '../../common/utils/pagination';
import { paginate } from '../../common/utils/response';
import type { PaginatedData } from '../../common/types/api-response';
import { createLogger } from '../../logger';
import { pushService } from '../push/push.service';
import { resolveNotificationPreferences, type NotificationPreferences } from '../users/users.model';
import { usersService } from '../users/users.service';
import type { NotificationDocument } from './notification.model';
import { toNotificationResponse, type NotificationResponse } from './notification-response';
import { NotificationType } from './notifications.enums';
import { notificationsRepository, NotificationsRepository } from './notifications.repository';
import type { ListNotificationsQuery } from './notifications.validation';

/** Notification types the recipient may flag as wrong (non-blocking pushback). */
const DISPUTABLE = new Set<NotificationType>([
  NotificationType.SplitAdded,
  NotificationType.MembershipInherited,
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
  amount: number;
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
   * Flags a split/inherited notification the recipient believes is wrong. This is
   * non-blocking pushback: nothing is deleted — the split's creator is notified so
   * they can correct or remove it from the group. Idempotent guard prevents double
   * flagging.
   */
  async dispute(userId: string, id: string): Promise<NotificationResponse> {
    const notification = await this.repository.findOwnedByIdOrThrow(id, userId);
    if (!DISPUTABLE.has(notification.type)) {
      throw new BadRequestException('This notification cannot be flagged');
    }
    if (notification.isDisputed) {
      throw new BadRequestException('You already flagged this');
    }

    const updated = await this.repository.markDisputed(id, userId);

    // Tell the split's creator (if any) so they can review/correct it.
    if (notification.actorUserId) {
      const disputerName = await this.resolveName(userId);
      await this.emit({
        userId: notification.actorUserId,
        type: NotificationType.SplitDisputed,
        title: 'Split flagged',
        body: `${disputerName} flagged a split you added. Tap to review it.`,
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
    const body = input.isDirect
      ? `${input.actorName} added a ${money} split with you${forWhat}.`
      : `${input.actorName} added you to a ${money} split${forWhat}${
          input.groupName ? ` in ${input.groupName}` : ''
        }.`;

    await this.emit({
      userId: new Types.ObjectId(input.recipientUserId),
      type: NotificationType.SplitAdded,
      title: 'New split',
      body,
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
