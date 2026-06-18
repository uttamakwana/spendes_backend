import { z } from 'zod';
import { PaymentMethod } from '../../common/enums/payment-method';
import { objectId } from '../../common/utils/object-id';
import { paginationQuerySchema } from '../../common/utils/pagination';
import { SplitStrategy } from './splits.enums';

const currencyCode = z
  .string()
  .trim()
  .regex(/^[A-Za-z]{3}$/, 'currency must be a 3-letter ISO code');

/** Amounts only need to balance to the nearest paisa. */
const EPSILON = 0.005;

const payerSchema = z.object({
  memberId: objectId,
  amount: z.number().positive().max(1_000_000_000_000),
});

const splitEntrySchema = z.object({
  memberId: objectId,
  exactAmount: z.number().positive().max(1_000_000_000_000).optional(),
  percentage: z.number().min(0).max(100).optional(),
  shares: z.number().positive().max(1_000_000).optional(),
});

const hasDuplicateMembers = (entries: { memberId: string }[]): boolean => {
  const ids = entries.map((e) => e.memberId);
  return new Set(ids).size !== ids.length;
};

/**
 * Payload for `POST /groups/:groupId/expenses`. The cross-field rules (payers sum to
 * the total; the right per-member value is present for the chosen strategy; those
 * values sum correctly) are enforced in `superRefine` so the service receives a
 * self-consistent expense. Membership of every `memberId` is checked in the service.
 */
export const createGroupExpenseSchema = z
  .object({
    description: z.string().trim().min(1).max(140),
    amount: z.number().positive().max(1_000_000_000_000),
    currency: currencyCode.optional(),
    category: z.string().trim().min(1).max(50).optional(),
    spentAt: z.coerce.date().optional(),
    notes: z.string().trim().max(1000).optional(),
    paidBy: z.array(payerSchema).min(1),
    splitStrategy: z.nativeEnum(SplitStrategy),
    splits: z.array(splitEntrySchema).min(1),
  })
  .superRefine((data, ctx) => {
    if (hasDuplicateMembers(data.paidBy)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'A member appears twice in paidBy',
        path: ['paidBy'],
      });
    }
    if (hasDuplicateMembers(data.splits)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'A member appears twice in splits',
        path: ['splits'],
      });
    }

    const paidSum = data.paidBy.reduce((acc, p) => acc + p.amount, 0);
    if (Math.abs(paidSum - data.amount) > EPSILON) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `paidBy amounts must sum to the total (${data.amount})`,
        path: ['paidBy'],
      });
    }

    switch (data.splitStrategy) {
      case SplitStrategy.Exact: {
        if (data.splits.some((s) => s.exactAmount === undefined)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Each split needs an exactAmount for the exact strategy',
            path: ['splits'],
          });
          break;
        }
        const sum = data.splits.reduce((acc, s) => acc + (s.exactAmount ?? 0), 0);
        if (Math.abs(sum - data.amount) > EPSILON) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Split amounts must sum to the total (${data.amount})`,
            path: ['splits'],
          });
        }
        break;
      }
      case SplitStrategy.Percentage: {
        if (data.splits.some((s) => s.percentage === undefined)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Each split needs a percentage for the percentage strategy',
            path: ['splits'],
          });
          break;
        }
        const sum = data.splits.reduce((acc, s) => acc + (s.percentage ?? 0), 0);
        if (Math.abs(sum - 100) > EPSILON) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Percentages must sum to 100',
            path: ['splits'],
          });
        }
        break;
      }
      case SplitStrategy.Shares: {
        if (data.splits.some((s) => s.shares === undefined)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Each split needs a shares value for the shares strategy',
            path: ['splits'],
          });
        }
        break;
      }
      case SplitStrategy.Equal:
      default:
        break; // No per-member value required.
    }
  });

export type CreateGroupExpenseInput = z.infer<typeof createGroupExpenseSchema>;

/**
 * Payload for `PATCH /groups/:groupId/expenses/:expenseId`. Only metadata is
 * editable here; to change the amount, payers, or split, delete and re-add the
 * expense (keeps the split-consistency rules in one place).
 */
export const updateGroupExpenseSchema = z
  .object({
    description: z.string().trim().min(1).max(140),
    category: z.string().trim().min(1).max(50),
    spentAt: z.coerce.date(),
    notes: z.string().trim().max(1000),
  })
  .partial();

export type UpdateGroupExpenseInput = z.infer<typeof updateGroupExpenseSchema>;

/** Payload for `POST /groups/:groupId/settlements` — record a payment between members. */
export const createSettlementSchema = z.object({
  fromMemberId: objectId.optional(),
  toMemberId: objectId,
  amount: z.number().positive().max(1_000_000_000_000),
  currency: currencyCode.optional(),
  method: z.nativeEnum(PaymentMethod).optional(),
  note: z.string().trim().max(280).optional(),
  settledAt: z.coerce.date().optional(),
  // UPI transaction reference from the settle-up intent — used for idempotency so the
  // same payment records once even if the client confirms it more than once.
  reference: z.string().trim().min(1).max(64).optional(),
});

export type CreateSettlementInput = z.infer<typeof createSettlementSchema>;

/** Payload for `POST /groups/:groupId/settlements/intent` — build a UPI deep link to pay a member. */
export const settlementIntentSchema = z.object({
  toMemberId: objectId,
  amount: z.number().positive().max(1_000_000_000_000),
  note: z.string().trim().max(280).optional(),
});

export type SettlementIntentInput = z.infer<typeof settlementIntentSchema>;

/** Pagination for the group-scoped list endpoints. */
export const listGroupItemsQuerySchema = paginationQuerySchema;
export type ListGroupItemsQuery = z.infer<typeof listGroupItemsQuerySchema>;

/** Route params for the group-scoped routes (mounted under `/groups/:groupId`). */
export const groupScopeParamsSchema = z.object({ groupId: objectId });
export const expenseParamsSchema = z.object({ groupId: objectId, expenseId: objectId });
