import { Types, type FilterQuery, type Model } from 'mongoose';
import type { PaginatedData } from '../../common/types/api-response';
import type { PaginationQuery } from '../../common/utils/pagination';
import { paginate } from '../../common/utils/response';
import { UserModel } from '../../database/models.registry';

/** Escapes a user-supplied string for safe use inside a RegExp (search). */
export const escapeRegex = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * `{ $gte, $lte }` for an optional from/to window, or undefined when neither is set.
 * A date-only `to` (e.g. `2026-09-29`, parsed as midnight) is widened to the end of
 * that day so the range is inclusive, as anyone picking a date expects.
 */
export function dateRange(from?: Date, to?: Date): { $gte?: Date; $lte?: Date } | undefined {
  if (!from && !to) return undefined;
  const range: { $gte?: Date; $lte?: Date } = {};
  if (from) range.$gte = from;
  if (to) {
    const isMidnight =
      to.getUTCHours() === 0 &&
      to.getUTCMinutes() === 0 &&
      to.getUTCSeconds() === 0 &&
      to.getUTCMilliseconds() === 0;
    range.$lte = isMidnight ? new Date(to.getTime() + 86_400_000 - 1) : to;
  }
  return range;
}

/** `{ $gte, $lte }` for optional amount bounds, or undefined. */
export function amountRange(
  min?: number,
  max?: number,
): { $gte?: number; $lte?: number } | undefined {
  if (min === undefined && max === undefined) return undefined;
  const range: { $gte?: number; $lte?: number } = {};
  if (min !== undefined) range.$gte = min;
  if (max !== undefined) range.$lte = max;
  return range;
}

export const daysAgo = (days: number): Date => new Date(Date.now() - days * 86_400_000);

/** The compact user shape embedded next to any record in an admin list. */
export interface UserBrief {
  id: string;
  fullName: string;
  phoneE164: string;
  avatarUrl?: string;
  isActive: boolean;
}

type IdLike = Types.ObjectId | string | null | undefined;

/** Loads briefs for a set of user ids in one query. */
export async function loadUserBriefs(ids: IdLike[]): Promise<Map<string, UserBrief>> {
  const unique = [...new Set(ids.filter(Boolean).map((id) => id!.toString()))];
  if (unique.length === 0) return new Map();
  const users = await UserModel.find({ _id: { $in: unique } })
    .select('firstName lastName dialCode phoneNumber avatarUrl isActive')
    .lean();
  return new Map(
    users.map((u) => [
      u._id.toString(),
      {
        id: u._id.toString(),
        fullName: `${u.firstName} ${u.lastName}`.trim(),
        phoneE164: `${u.dialCode}${u.phoneNumber}`,
        avatarUrl: u.avatarUrl,
        isActive: u.isActive,
      },
    ]),
  );
}

/**
 * Converts a lean Mongo document into an API shape: `_id` → `id` and `__v` dropped.
 * Nested ObjectIds serialize to hex strings via JSON as usual.
 */
export function withId<T extends { _id: Types.ObjectId }>(
  doc: T,
): Omit<T, '_id' | '__v'> & { id: string } {
  const { _id, __v: _v, ...rest } = doc as T & { __v?: number };
  return { id: _id.toString(), ...rest };
}

/** Maps docs with `withId` and attaches `user` (brief) resolved from `field`. */
export async function withUsers<T extends { _id: Types.ObjectId }>(
  docs: T[],
  field: keyof T & string = 'userId' as keyof T & string,
): Promise<(Omit<T, '_id' | '__v'> & { id: string; user: UserBrief | null })[]> {
  const briefs = await loadUserBriefs(docs.map((d) => d[field] as unknown as IdLike));
  return docs.map((d) => ({
    ...withId(d),
    user: briefs.get(String(d[field] ?? '')) ?? null,
  }));
}

/** Sums `amount` grouped by currency — money is never added across currencies. */
export interface CurrencyTotal {
  currency: string;
  total: number;
  count: number;
}

export const round2 = (n: number): number => Math.round(n * 100) / 100;

export function toCurrencyTotals(
  rows: { _id: string; total: number; count: number }[],
): CurrencyTotal[] {
  return rows
    .map((r) => ({ currency: r._id ?? 'INR', total: round2(r.total), count: r.count }))
    .sort((a, b) => b.count - a.count);
}

/** Aggregation stage: group by currency, summing `field`. */
export const byCurrencyStage = (field = '$amount') => ({
  $group: { _id: '$currency', total: { $sum: field }, count: { $sum: 1 } },
});

export const isObjectId = (v: string): boolean => Types.ObjectId.isValid(v) && v.length === 24;

/**
 * One page of `model` matching `filter`, each row mapped with {@link withUsers}.
 * `query.sortBy` (when given) overrides `defaultSort`.
 */
export async function listWithUsers<T extends { _id: Types.ObjectId }>(
  model: Model<T>,
  filter: FilterQuery<T>,
  query: PaginationQuery,
  defaultSort: Record<string, 1 | -1>,
  opts: { select?: string; userField?: keyof T & string } = {},
): Promise<PaginatedData<Record<string, unknown>>> {
  const sort = query.sortBy
    ? { [query.sortBy]: query.sortOrder === 'asc' ? 1 : -1, _id: -1 }
    : { ...defaultSort, _id: -1 };
  let find = model
    .find(filter)
    .sort(sort as Record<string, 1 | -1>)
    .skip((query.page - 1) * query.limit)
    .limit(query.limit);
  if (opts.select) find = find.select(opts.select);
  const [docs, totalItems] = await Promise.all([find.lean<T[]>(), model.countDocuments(filter)]);
  const items = (await withUsers(docs, opts.userField)) as unknown as Record<string, unknown>[];
  return paginate(items, { page: query.page, limit: query.limit, totalItems });
}

/**
 * Filters built from query strings hold ObjectIds as strings, which `find` casts
 * but `aggregate` does not — this re-types the id fields for an aggregation `$match`.
 */
export function castIds<T>(filter: FilterQuery<T>, keys = ['userId', 'groupId']): FilterQuery<T> {
  const out = { ...filter } as Record<string, unknown>;
  for (const key of keys) {
    if (typeof out[key] === 'string') out[key] = new Types.ObjectId(out[key] as string);
  }
  return out as FilterQuery<T>;
}
