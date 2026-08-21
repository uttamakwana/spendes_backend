import { z } from 'zod';
import { paginationQuerySchema } from '../../common/utils/pagination';
import { DisputeReason } from './notifications.enums';

/**
 * Query for `GET /notifications` — pagination plus an `unreadOnly` toggle so the
 * inbox can show everything or just what still needs attention.
 */
export const listNotificationsQuerySchema = paginationQuerySchema.extend({
  unreadOnly: z.coerce.boolean().optional(),
});

export type ListNotificationsQuery = z.infer<typeof listNotificationsQuerySchema>;

/**
 * Body for `POST /notifications/:id/dispute`. Both fields are optional so a bare
 * "this isn't right" still works, but a reason is what turns the reply to whoever
 * added it into something they can act on.
 */
export const disputeNotificationSchema = z.object({
  reason: z.nativeEnum(DisputeReason).optional(),
  note: z.string().trim().max(280).optional(),
});

export type DisputeNotificationInput = z.infer<typeof disputeNotificationSchema>;
