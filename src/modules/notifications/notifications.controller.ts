import type { Request, Response } from 'express';
import { asyncHandler } from '../../common/middleware/async-handler';
import { sendSuccess } from '../../common/utils/response';
import { notificationsService } from './notifications.service';
import type { ListNotificationsQuery } from './notifications.validation';

/** GET /notifications — the authenticated user's inbox (paginated, optionally unread-only). */
export const listNotifications = asyncHandler(async (req: Request, res: Response) => {
  const page = await notificationsService.list(
    req.user!.id,
    req.query as unknown as ListNotificationsQuery,
  );
  sendSuccess(res, req, page, 'Notifications retrieved successfully');
});

/** GET /notifications/unread-count — the unread badge count. */
export const getUnreadCount = asyncHandler(async (req: Request, res: Response) => {
  const result = await notificationsService.unreadCount(req.user!.id);
  sendSuccess(res, req, result, 'Unread count retrieved successfully');
});

/** PATCH /notifications/:id/read — mark one notification read. */
export const markNotificationRead = asyncHandler(async (req: Request, res: Response) => {
  const notification = await notificationsService.markRead(req.user!.id, req.params.id as string);
  sendSuccess(res, req, notification, 'Notification marked as read');
});

/** POST /notifications/read-all — mark every notification read. */
export const markAllNotificationsRead = asyncHandler(async (req: Request, res: Response) => {
  const result = await notificationsService.markAllRead(req.user!.id);
  sendSuccess(res, req, result, 'All notifications marked as read');
});

/** POST /notifications/:id/dispute — flag a split/inherited item as wrong (notifies its creator). */
export const disputeNotification = asyncHandler(async (req: Request, res: Response) => {
  const notification = await notificationsService.dispute(req.user!.id, req.params.id as string);
  sendSuccess(res, req, notification, 'Notification flagged');
});
