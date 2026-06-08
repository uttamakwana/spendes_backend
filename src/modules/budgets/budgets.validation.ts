import { z } from 'zod';
import { BudgetPeriod } from '../../common/enums/budget-period';
import { paginationQuerySchema } from '../../common/utils/pagination';

/**
 * Payload for `POST /budgets`. `category` is optional (absent = an overall budget).
 * A `custom` period requires `startDate` and `endDate` (end after start); the other
 * periods ignore those fields and recur automatically.
 */
export const createBudgetSchema = z
  .object({
    name: z.string().trim().min(1).max(80).optional(),
    category: z.string().trim().min(1).max(50).optional(),
    amount: z.number().positive().max(1_000_000_000_000),
    currency: z
      .string()
      .trim()
      .regex(/^[A-Za-z]{3}$/, 'currency must be a 3-letter ISO code')
      .optional(),
    period: z.nativeEnum(BudgetPeriod),
    startDate: z.coerce.date().optional(),
    endDate: z.coerce.date().optional(),
    alertThresholdPct: z.number().min(1).max(100).optional(),
    isActive: z.boolean().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.period === BudgetPeriod.Custom) {
      if (!data.startDate || !data.endDate) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'A custom budget needs both startDate and endDate',
          path: ['period'],
        });
      } else if (data.endDate <= data.startDate) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'endDate must be after startDate',
          path: ['endDate'],
        });
      }
    }
  });

export type CreateBudgetInput = z.infer<typeof createBudgetSchema>;

/**
 * Payload for `PATCH /budgets/:id`. Period/dates are intentionally not editable here
 * (to keep the custom-date rules in one place) — change them by recreating the budget.
 */
export const updateBudgetSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    category: z.string().trim().min(1).max(50),
    amount: z.number().positive().max(1_000_000_000_000),
    currency: z
      .string()
      .trim()
      .regex(/^[A-Za-z]{3}$/, 'currency must be a 3-letter ISO code'),
    alertThresholdPct: z.number().min(1).max(100),
    isActive: z.boolean(),
  })
  .partial();

export type UpdateBudgetInput = z.infer<typeof updateBudgetSchema>;

/** Query for `GET /budgets` — pagination plus an optional active-only filter. */
export const listBudgetsQuerySchema = paginationQuerySchema.extend({
  period: z.nativeEnum(BudgetPeriod).optional(),
  activeOnly: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
});

export type ListBudgetsQuery = z.infer<typeof listBudgetsQuerySchema>;
