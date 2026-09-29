import { z } from 'zod';
import { CategoryType } from '../../common/enums/category-type';
import { ExpenseSource } from '../../common/enums/expense-source';
import { PaymentMethod } from '../../common/enums/payment-method';
import { PlanType } from '../../common/enums/plan-type';
import { Role } from '../../common/enums/role';
import { objectId } from '../../common/utils/object-id';
import { paginationQuerySchema } from '../../common/utils/pagination';
import { AuthEventType } from '../auth/auth-event.model';
import { GroupKind } from '../groups/groups.enums';
import { DisputeReason, NotificationType } from '../notifications/notifications.enums';
import { DevicePlatform } from '../push/push.enums';
import { BroadcastAudience, BroadcastChannel } from './broadcast.model';

/** Query-string booleans arrive as the strings 'true'/'false' — parse them safely. */
const booleanQuery = z
  .enum(['true', 'false'])
  .transform((v) => v === 'true')
  .optional();

const dateQuery = z.coerce.date().optional();
const amountQuery = z.coerce.number().min(0).optional();
const currencyQuery = z.string().trim().toUpperCase().length(3).optional();

/** Shared by every per-record admin list: owner filter + created/occurred window. */
const ownedListQuery = paginationQuerySchema.extend({
  userId: objectId.optional(),
  from: dateQuery,
  to: dateQuery,
});

// ---------------------------------------------------------------------------
// Overview
// ---------------------------------------------------------------------------

/** GET /admin/stats/timeseries — daily activity counts over a window. */
export const timeseriesQuerySchema = z.object({
  days: z.coerce.number().int().min(7).max(365).default(30),
});
export type TimeseriesQuery = z.infer<typeof timeseriesQuerySchema>;

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

/** GET /admin/users — paginated, searchable, filterable by status/role/plan/country. */
export const listUsersQuerySchema = paginationQuerySchema.extend({
  isActive: booleanQuery,
  role: z.nativeEnum(Role).optional(),
  plan: z.nativeEnum(PlanType).optional(),
  country: z.string().trim().toUpperCase().length(2).optional(),
  joinedFrom: dateQuery,
  joinedTo: dateQuery,
  sortBy: z.enum(['createdAt', 'lastLoginAt', 'firstName', 'phoneNumber']).optional(),
});
export type ListUsersQuery = z.infer<typeof listUsersQuerySchema>;

/** PATCH /admin/users/:id — account status, access, plan and support edits to the profile. */
export const updateUserSchema = z
  .object({
    isActive: z.boolean().optional(),
    roles: z.array(z.nativeEnum(Role)).min(1).optional(),
    plan: z.nativeEnum(PlanType).optional(),
    firstName: z.string().trim().min(1).max(50).optional(),
    lastName: z.string().trim().min(1).max(50).optional(),
    email: z.string().trim().toLowerCase().email().nullable().optional(),
  })
  .refine((b) => Object.values(b).some((v) => v !== undefined), {
    message: 'Provide at least one field to update',
  });
export type UpdateUserInput = z.infer<typeof updateUserSchema>;

/** POST /admin/users/:id/notify — a direct message from the Spendes team. */
export const notifyUserSchema = z.object({
  title: z.string().trim().min(1).max(80),
  body: z.string().trim().min(1).max(300),
  channel: z.nativeEnum(BroadcastChannel).default(BroadcastChannel.InboxAndPush),
});
export type NotifyUserInput = z.infer<typeof notifyUserSchema>;

// ---------------------------------------------------------------------------
// Money
// ---------------------------------------------------------------------------

/** GET /admin/expenses */
export const listExpensesQuerySchema = ownedListQuery.extend({
  category: z.string().trim().min(1).optional(),
  source: z.nativeEnum(ExpenseSource).optional(),
  paymentMethod: z.nativeEnum(PaymentMethod).optional(),
  currency: currencyQuery,
  groupId: objectId.optional(),
  minAmount: amountQuery,
  maxAmount: amountQuery,
  sortBy: z.enum(['spentAt', 'amount', 'createdAt']).optional(),
});
export type ListExpensesQuery = z.infer<typeof listExpensesQuerySchema>;

/** GET /admin/income */
export const listIncomeQuerySchema = ownedListQuery.extend({
  category: z.string().trim().min(1).optional(),
  receivedVia: z.nativeEnum(PaymentMethod).optional(),
  currency: currencyQuery,
  isRecurring: booleanQuery,
  minAmount: amountQuery,
  maxAmount: amountQuery,
  sortBy: z.enum(['receivedAt', 'amount', 'createdAt']).optional(),
});
export type ListIncomeQuery = z.infer<typeof listIncomeQuerySchema>;

/** GET /admin/{budgets,emis,goals,investments} — the planning modules share one filter shape. */
export const listPlanningQuerySchema = ownedListQuery.extend({
  isActive: booleanQuery,
  /** EMI type / investment asset class / budget period, depending on the resource. */
  type: z.string().trim().min(1).optional(),
  currency: currencyQuery,
});
export type ListPlanningQuery = z.infer<typeof listPlanningQuerySchema>;

// ---------------------------------------------------------------------------
// Social
// ---------------------------------------------------------------------------

/** GET /admin/groups — groups and friendships (direct groups). */
export const listGroupsQuerySchema = ownedListQuery.extend({
  kind: z.nativeEnum(GroupKind).optional(),
  isActive: booleanQuery,
});
export type ListGroupsQuery = z.infer<typeof listGroupsQuerySchema>;

/** PATCH /admin/groups/:id — archive / restore. */
export const updateGroupSchema = z.object({ isActive: z.boolean() });
export type UpdateGroupInput = z.infer<typeof updateGroupSchema>;

/** GET /admin/group-expenses and /admin/settlements. `userId` = the author. */
export const listGroupActivityQuerySchema = ownedListQuery.extend({
  groupId: objectId.optional(),
  currency: currencyQuery,
});
export type ListGroupActivityQuery = z.infer<typeof listGroupActivityQuerySchema>;

/** GET /admin/disputes */
export const listDisputesQuerySchema = ownedListQuery.extend({
  reason: z.nativeEnum(DisputeReason).optional(),
});
export type ListDisputesQuery = z.infer<typeof listDisputesQuerySchema>;

// ---------------------------------------------------------------------------
// Engagement
// ---------------------------------------------------------------------------

/** GET /admin/notifications */
export const listNotificationsQuerySchema = ownedListQuery.extend({
  type: z.nativeEnum(NotificationType).optional(),
  isRead: booleanQuery,
  isDisputed: booleanQuery,
});
export type ListNotificationsQuery = z.infer<typeof listNotificationsQuerySchema>;

/** POST /admin/broadcasts — send (or with `dryRun`, just count) an announcement. */
export const broadcastSchema = z
  .object({
    title: z.string().trim().min(1).max(80),
    body: z.string().trim().min(1).max(300),
    audience: z.nativeEnum(BroadcastAudience),
    audienceValues: z.array(z.string().trim().min(1)).max(500).default([]),
    channel: z.nativeEnum(BroadcastChannel).default(BroadcastChannel.InboxAndPush),
    dryRun: z.boolean().default(false),
  })
  .superRefine((b, ctx) => {
    if (b.audience !== BroadcastAudience.All && b.audienceValues.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['audienceValues'],
        message: `Choose at least one ${b.audience} for this audience`,
      });
    }
    if (b.audience === BroadcastAudience.Users) {
      const bad = b.audienceValues.filter((v) => !/^[0-9a-fA-F]{24}$/.test(v));
      if (bad.length) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['audienceValues'],
          message: `Invalid user id(s): ${bad.slice(0, 3).join(', ')}`,
        });
      }
    }
  });
export type BroadcastInput = z.infer<typeof broadcastSchema>;

/** GET /admin/push-tokens */
export const listPushTokensQuerySchema = ownedListQuery.extend({
  platform: z.nativeEnum(DevicePlatform).optional(),
});
export type ListPushTokensQuery = z.infer<typeof listPushTokensQuerySchema>;

/** GET /admin/insights */
export const listInsightsQuerySchema = ownedListQuery.extend({
  source: z.enum(['model', 'heuristic']).optional(),
});
export type ListInsightsQuery = z.infer<typeof listInsightsQuerySchema>;

// ---------------------------------------------------------------------------
// Platform
// ---------------------------------------------------------------------------

/** GET /admin/waitlist — paginated, searchable by email, filterable by invited state. */
export const listWaitlistQuerySchema = paginationQuerySchema.extend({
  invited: booleanQuery,
  source: z.string().trim().min(1).optional(),
});
export type ListWaitlistQuery = z.infer<typeof listWaitlistQuerySchema>;

/** PATCH /admin/waitlist/:id — mark an entry invited (or un-invite it). */
export const updateWaitlistSchema = z.object({
  invited: z.boolean(),
});
export type UpdateWaitlistInput = z.infer<typeof updateWaitlistSchema>;

/** POST /admin/waitlist/bulk — invite / un-invite / delete many entries at once. */
export const bulkWaitlistSchema = z.object({
  ids: z.array(objectId).min(1).max(500),
  action: z.enum(['invite', 'uninvite', 'delete']),
});
export type BulkWaitlistInput = z.infer<typeof bulkWaitlistSchema>;

/** GET /admin/categories/usage */
export const categoryUsageQuerySchema = z.object({
  type: z.nativeEnum(CategoryType).default(CategoryType.Expense),
});
export type CategoryUsageQuery = z.infer<typeof categoryUsageQuerySchema>;

/** GET /admin/auth-events */
export const listAuthEventsQuerySchema = ownedListQuery.extend({
  type: z.nativeEnum(AuthEventType).optional(),
  success: booleanQuery,
  /** Matches the national number (digits; partial ok). */
  phone: z.string().trim().min(1).optional(),
});
export type ListAuthEventsQuery = z.infer<typeof listAuthEventsQuerySchema>;

/** DELETE /admin/otp — clear pending codes (resets the attempt lockout + resend cooldown). */
export const clearOtpSchema = z.object({
  dialCode: z
    .string()
    .trim()
    .regex(/^\+\d{1,4}$/, 'dialCode like +91'),
  phoneNumber: z
    .string()
    .trim()
    .regex(/^\d{4,15}$/, 'digits only'),
});
export type ClearOtpInput = z.infer<typeof clearOtpSchema>;

/** GET /admin/audit-logs */
export const listAuditQuerySchema = paginationQuerySchema.extend({
  actorId: objectId.optional(),
  targetType: z.string().trim().min(1).optional(),
  targetId: z.string().trim().min(1).optional(),
  action: z.string().trim().min(1).optional(),
  from: dateQuery,
  to: dateQuery,
});
export type ListAuditQuery = z.infer<typeof listAuditQuerySchema>;
