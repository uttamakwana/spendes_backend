import { z } from 'zod';
import { PaymentMethod } from '../../common/enums/payment-method';
import { paginationQuerySchema } from '../../common/utils/pagination';

/**
 * The editable fields of an expense, shared by the create and update contracts.
 * `amount` is a positive major-unit value; it is rounded to 2 decimals by the
 * service before persistence. `currency` is optional on input — the service falls
 * back to the owner's `defaultCurrency`. `spentAt` accepts an ISO date string and
 * defaults to "now" when omitted.
 */
const expenseFields = {
  amount: z.number().positive().max(1_000_000_000_000),
  currency: z
    .string()
    .trim()
    .regex(/^[A-Za-z]{3}$/, 'currency must be a 3-letter ISO code')
    .optional(),
  category: z.string().trim().min(1).max(50),
  description: z.string().trim().max(255).optional(),
  merchant: z.string().trim().max(120).optional(),
  paymentMethod: z.nativeEnum(PaymentMethod).optional(),
  spentAt: z.coerce.date().optional(),
  notes: z.string().trim().max(1000).optional(),
  tags: z.array(z.string().trim().min(1).max(30)).max(20).optional(),
  receiptUrl: z.string().url().optional(),
};

/** Payload for `POST /expenses`. `amount` and `category` are required. */
export const createExpenseSchema = z.object(expenseFields);

export type CreateExpenseInput = z.infer<typeof createExpenseSchema>;

/** Payload for `PATCH /expenses/:id`. Every field is optional; at least nothing is required. */
export const updateExpenseSchema = z.object(expenseFields).partial();

export type UpdateExpenseInput = z.infer<typeof updateExpenseSchema>;

/**
 * Query for `GET /expenses` — pagination/sort/search plus expense-specific filters.
 * Date and amount bounds are inclusive; any subset may be supplied.
 */
export const listExpensesQuerySchema = paginationQuerySchema.extend({
  category: z.string().trim().min(1).optional(),
  paymentMethod: z.nativeEnum(PaymentMethod).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  minAmount: z.coerce.number().nonnegative().optional(),
  maxAmount: z.coerce.number().positive().optional(),
});

export type ListExpensesQuery = z.infer<typeof listExpensesQuerySchema>;

/** Query for `GET /expenses/summary` — an optional inclusive date window. */
export const expenseSummaryQuerySchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

export type ExpenseSummaryQuery = z.infer<typeof expenseSummaryQuerySchema>;
