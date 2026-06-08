import { z } from 'zod';
import { PaymentMethod } from '../../common/enums/payment-method';
import { paginationQuerySchema } from '../../common/utils/pagination';

/**
 * The editable fields of an income entry, shared by the create and update
 * contracts. `amount` is a positive major-unit value; it is rounded to 2 decimals
 * by the service before persistence. `currency` is optional on input — the service
 * falls back to the owner's `defaultCurrency`. `receivedAt` accepts an ISO date
 * string and defaults to "now" when omitted.
 */
const incomeFields = {
  amount: z.number().positive().max(1_000_000_000_000),
  currency: z
    .string()
    .trim()
    .regex(/^[A-Za-z]{3}$/, 'currency must be a 3-letter ISO code')
    .optional(),
  category: z.string().trim().min(1).max(50),
  source: z.string().trim().max(120).optional(),
  description: z.string().trim().max(255).optional(),
  receivedVia: z.nativeEnum(PaymentMethod).optional(),
  receivedAt: z.coerce.date().optional(),
  notes: z.string().trim().max(1000).optional(),
  tags: z.array(z.string().trim().min(1).max(30)).max(20).optional(),
  isRecurring: z.boolean().optional(),
};

/** Payload for `POST /income`. `amount` and `category` are required. */
export const createIncomeSchema = z.object(incomeFields);

export type CreateIncomeInput = z.infer<typeof createIncomeSchema>;

/** Payload for `PATCH /income/:id`. Every field is optional. */
export const updateIncomeSchema = z.object(incomeFields).partial();

export type UpdateIncomeInput = z.infer<typeof updateIncomeSchema>;

/**
 * Query for `GET /income` — pagination/sort/search plus income-specific filters.
 * Date and amount bounds are inclusive; any subset may be supplied.
 */
export const listIncomeQuerySchema = paginationQuerySchema.extend({
  category: z.string().trim().min(1).optional(),
  receivedVia: z.nativeEnum(PaymentMethod).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  minAmount: z.coerce.number().nonnegative().optional(),
  maxAmount: z.coerce.number().positive().optional(),
});

export type ListIncomeQuery = z.infer<typeof listIncomeQuerySchema>;

/** Query for `GET /income/summary` — an optional inclusive date window. */
export const incomeSummaryQuerySchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

export type IncomeSummaryQuery = z.infer<typeof incomeSummaryQuerySchema>;
