import { z } from 'zod';

/**
 * Payload for `POST /ai/expenses/parse`. One field: the sentence the user typed or
 * dictated. The 300-character ceiling is not arbitrary — this endpoint is for "spent
 * 250 on groceries yesterday", not for pasting a bank statement, and an unbounded
 * string here is an unbounded bill.
 */
export const parseExpenseSchema = z.object({
  text: z.string().trim().min(2, 'Say what you spent').max(300),
});

export type ParseExpenseInput = z.infer<typeof parseExpenseSchema>;

/**
 * Query for `GET /ai/insights`. `month` is `YYYY-MM` in the user's own zone and
 * defaults to the month they are in; `refresh` forces a regeneration instead of
 * serving the stored summary.
 */
export const insightsQuerySchema = z.object({
  month: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}$/, 'month must be in YYYY-MM format')
    .optional(),
  refresh: z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .optional(),
});

export type InsightsQuery = z.infer<typeof insightsQuerySchema>;
