import { z } from 'zod';
import { Role } from '../../common/enums/role';
import { paginationQuerySchema } from '../../common/utils/pagination';

/** Query-string booleans arrive as the strings 'true'/'false' — parse them safely. */
const booleanQuery = z
  .enum(['true', 'false'])
  .transform((v) => v === 'true')
  .optional();

/** GET /admin/users — paginated, searchable, filterable by status/role. */
export const listUsersQuerySchema = paginationQuerySchema.extend({
  isActive: booleanQuery,
  role: z.nativeEnum(Role).optional(),
});
export type ListUsersQuery = z.infer<typeof listUsersQuerySchema>;

/** PATCH /admin/users/:id — toggle active state and/or set roles (promote/demote). */
export const updateUserSchema = z
  .object({
    isActive: z.boolean().optional(),
    roles: z.array(z.nativeEnum(Role)).min(1).optional(),
  })
  .refine((b) => b.isActive !== undefined || b.roles !== undefined, {
    message: 'Provide at least one of: isActive, roles',
  });
export type UpdateUserInput = z.infer<typeof updateUserSchema>;

/** GET /admin/stats/timeseries — daily new-user & waitlist counts over a window. */
export const timeseriesQuerySchema = z.object({
  days: z.coerce.number().int().min(7).max(90).default(30),
});
export type TimeseriesQuery = z.infer<typeof timeseriesQuerySchema>;

/** GET /admin/waitlist — paginated, searchable by email, filterable by invited state. */
export const listWaitlistQuerySchema = paginationQuerySchema.extend({
  invited: booleanQuery,
});
export type ListWaitlistQuery = z.infer<typeof listWaitlistQuerySchema>;

/** PATCH /admin/waitlist/:id — mark an entry invited (or un-invite it). */
export const updateWaitlistSchema = z.object({
  invited: z.boolean(),
});
export type UpdateWaitlistInput = z.infer<typeof updateWaitlistSchema>;
