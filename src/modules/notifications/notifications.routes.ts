import { Router } from 'express';
import { validate } from '../../common/middleware/validate';
import { idParamSchema } from '../../common/utils/object-id';
import { authenticate } from '../auth/auth.middleware';
import {
  disputeNotification,
  getUnreadCount,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from './notifications.controller';
import { listNotificationsQuerySchema } from './notifications.validation';

export const notificationsRouter: Router = Router();

// Every notification route requires authentication; ownership is enforced in the service.
notificationsRouter.use(authenticate);

notificationsRouter.get('/', validate({ query: listNotificationsQuerySchema }), listNotifications);

// Static paths must precede the `/:id/...` routes so they aren't captured as an id.
notificationsRouter.get('/unread-count', getUnreadCount);
notificationsRouter.post('/read-all', markAllNotificationsRead);

notificationsRouter.patch('/:id/read', validate({ params: idParamSchema }), markNotificationRead);
notificationsRouter.post('/:id/dispute', validate({ params: idParamSchema }), disputeNotification);
