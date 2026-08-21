import { type FilterQuery, Types } from 'mongoose';
import { BaseRepository } from '../../database/base.repository';
import { NotificationModel, type NotificationDocument } from './notification.model';
import { DisputeReason, NotificationType } from './notifications.enums';

/**
 * Data access for notifications. Inherits generic CRUD + pagination from
 * {@link BaseRepository} and adds owner-scoped reads (a user only ever sees their
 * own inbox) plus the unread count and bulk mark-as-read used by the inbox UI.
 */
export class NotificationsRepository extends BaseRepository<NotificationDocument> {
  constructor() {
    super(NotificationModel);
  }

  /** Fetches a notification by id only if it belongs to `userId`; throws 404 otherwise. */
  findOwnedByIdOrThrow(id: string, userId: string): Promise<NotificationDocument> {
    return this.findOneOrThrow({ _id: id, userId } as FilterQuery<NotificationDocument>);
  }

  /** Number of unread notifications for a user — drives the bell badge. */
  countUnread(userId: string): Promise<number> {
    return this.count({
      userId: new Types.ObjectId(userId),
      isRead: false,
    } as FilterQuery<NotificationDocument>);
  }

  /** Marks one notification read, scoped to its owner; throws 404 if not found/owned. */
  markRead(id: string, userId: string): Promise<NotificationDocument> {
    return this.findOneAndUpdate({ _id: id, userId } as FilterQuery<NotificationDocument>, {
      $set: { isRead: true },
    });
  }

  /** Marks one notification confirmed ("looks right") and read; throws 404 if not found/owned. */
  markConfirmed(id: string, userId: string): Promise<NotificationDocument> {
    return this.findOneAndUpdate({ _id: id, userId } as FilterQuery<NotificationDocument>, {
      $set: { isConfirmed: true, isRead: true },
    });
  }

  /** Flags one notification as disputed (and read), scoped to its owner; throws 404 otherwise. */
  markDisputed(
    id: string,
    userId: string,
    reason?: DisputeReason,
    note?: string,
  ): Promise<NotificationDocument> {
    return this.findOneAndUpdate({ _id: id, userId } as FilterQuery<NotificationDocument>, {
      $set: {
        isDisputed: true,
        isRead: true,
        ...(reason ? { disputeReason: reason } : {}),
        ...(note ? { disputeNote: note } : {}),
      },
    });
  }

  /**
   * Marks the *connection-level* items for one group ("X added you", "you inherited
   * this group") as confirmed. Confirming a connection settles those once and for
   * all; individual `SplitAdded` rows stay separately reviewable, because agreeing
   * you know someone is not agreeing to every amount they enter.
   */
  async confirmConnectionItems(userId: string, groupId: string): Promise<number> {
    const result = await this.model
      .updateMany(
        {
          userId: new Types.ObjectId(userId),
          groupId: new Types.ObjectId(groupId),
          type: { $in: [NotificationType.FriendAdded, NotificationType.MembershipInherited] },
          isDisputed: false,
        },
        { $set: { isConfirmed: true, isRead: true } },
      )
      .exec();
    return result.modifiedCount ?? 0;
  }

  /**
   * Drops an untouched "X added you as a friend" row for a group. Used when a split
   * from the same person lands moments later: two rows for one action is noise, so
   * the split notification (which names them too) supersedes it.
   */
  async deleteUnactionedFriendAdd(userId: string, groupId: string): Promise<number> {
    const result = await this.model
      .deleteMany({
        userId: new Types.ObjectId(userId),
        groupId: new Types.ObjectId(groupId),
        type: NotificationType.FriendAdded,
        isRead: false,
        isConfirmed: false,
        isDisputed: false,
      })
      .exec();
    return result.deletedCount ?? 0;
  }

  /** Marks every unread notification for a user read. Returns how many changed. */
  async markAllRead(userId: string): Promise<number> {
    const result = await this.model
      .updateMany({ userId: new Types.ObjectId(userId), isRead: false }, { $set: { isRead: true } })
      .exec();
    return result.modifiedCount ?? 0;
  }
}

/** Shared singleton instance used across the app. */
export const notificationsRepository = new NotificationsRepository();
