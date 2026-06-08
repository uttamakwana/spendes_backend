import { z } from 'zod';

/** Query for `GET /analytics/cashflow` — how many trailing months of trend to return. */
export const cashflowQuerySchema = z.object({
  months: z.coerce.number().int().min(1).max(24).default(6),
});

export type CashflowQuery = z.infer<typeof cashflowQuerySchema>;
