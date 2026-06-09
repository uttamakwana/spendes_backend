import { z } from 'zod';
import { paginationQuerySchema } from '../../common/utils/pagination';

/**
 * Query for `GET /notifications` — pagination plus an `unreadOnly` toggle so the
 * inbox can show everything or just what still needs attention.
 */
export const listNotificationsQuerySchema = paginationQuerySchema.extend({
  unreadOnly: z.coerce.boolean().optional(),
});

export type ListNotificationsQuery = z.infer<typeof listNotificationsQuerySchema>;
