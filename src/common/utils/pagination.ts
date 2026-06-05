import { z } from 'zod';
import type { SortOrder } from 'mongoose';

/**
 * Reusable query parameters for any paginated, sortable, searchable list endpoint.
 * Extend (`.extend({...})`) this in feature modules to add resource-specific filters.
 * Numbers arrive as strings on the query string, so they are coerced + bounded here.
 */
export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sortBy: z.string().trim().min(1).optional(),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
  search: z.string().trim().min(1).optional(),
});

export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

/**
 * Builds a Mongoose-compatible sort object from the query, or `undefined` when no
 * `sortBy` was requested (so the caller can apply its own default sort).
 */
export function buildSort(query: PaginationQuery): Record<string, SortOrder> | undefined {
  if (!query.sortBy) {
    return undefined;
  }
  return { [query.sortBy]: query.sortOrder === 'asc' ? 1 : -1 };
}
