import { type FilterQuery, Types } from 'mongoose';
import { BaseRepository } from '../../database/base.repository';
import { NotificationModel, type NotificationDocument } from './notification.model';

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

  /** Flags one notification as disputed (and read), scoped to its owner; throws 404 otherwise. */
  markDisputed(id: string, userId: string): Promise<NotificationDocument> {
    return this.findOneAndUpdate({ _id: id, userId } as FilterQuery<NotificationDocument>, {
      $set: { isDisputed: true, isRead: true },
    });
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
