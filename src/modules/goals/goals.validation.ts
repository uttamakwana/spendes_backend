import { z } from 'zod';
import { paginationQuerySchema } from '../../common/utils/pagination';

const currencyCode = z
  .string()
  .trim()
  .regex(/^[A-Za-z]{3}$/, 'currency must be a 3-letter ISO code');

const hexColor = z
  .string()
  .trim()
  .regex(/^#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})$/, 'color must be a hex value like #4ECDC4');

/** Payload for `POST /goals`. `currentAmount` seeds an opening balance (default 0). */
export const createGoalSchema = z.object({
  name: z.string().trim().min(1).max(100),
  targetAmount: z.number().positive().max(1_000_000_000_000),
  currentAmount: z.number().nonnegative().max(1_000_000_000_000).optional(),
  currency: currencyCode.optional(),
  targetDate: z.coerce.date().optional(),
  icon: z.string().trim().min(1).max(60).optional(),
  color: hexColor.optional(),
  notes: z.string().trim().max(1000).optional(),
});

export type CreateGoalInput = z.infer<typeof createGoalSchema>;

/** Payload for `PATCH /goals/:id`. `currentAmount` is changed via contributions, not here. */
export const updateGoalSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    targetAmount: z.number().positive().max(1_000_000_000_000),
    currency: currencyCode,
    targetDate: z.coerce.date(),
    icon: z.string().trim().min(1).max(60),
    color: hexColor,
    notes: z.string().trim().max(1000),
    isActive: z.boolean(),
  })
  .partial();

export type UpdateGoalInput = z.infer<typeof updateGoalSchema>;

/** Payload for `POST /goals/:id/contribute` — add a deposit toward the goal. */
export const contributeGoalSchema = z.object({
  amount: z.number().positive().max(1_000_000_000_000),
  note: z.string().trim().max(280).optional(),
  contributedAt: z.coerce.date().optional(),
});

export type ContributeGoalInput = z.infer<typeof contributeGoalSchema>;

/** Query for `GET /goals` — pagination plus an active-only filter. */
export const listGoalsQuerySchema = paginationQuerySchema.extend({
  activeOnly: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
});

export type ListGoalsQuery = z.infer<typeof listGoalsQuerySchema>;
