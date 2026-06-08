import { z } from 'zod';
import { paginationQuerySchema } from '../../common/utils/pagination';
import { InvestmentType } from './investments.enums';

/**
 * The editable fields of a holding, shared by create and update. `currentValue`
 * defaults to `investedAmount` on create (zero gain/loss until the user updates it).
 */
const investmentFields = {
  name: z.string().trim().min(1).max(120),
  type: z.nativeEnum(InvestmentType),
  investedAmount: z.number().nonnegative().max(1_000_000_000_000),
  currentValue: z.number().nonnegative().max(1_000_000_000_000).optional(),
  currency: z
    .string()
    .trim()
    .regex(/^[A-Za-z]{3}$/, 'currency must be a 3-letter ISO code')
    .optional(),
  quantity: z.number().nonnegative().max(1_000_000_000).optional(),
  platform: z.string().trim().min(1).max(80).optional(),
  notes: z.string().trim().max(1000).optional(),
  isActive: z.boolean().optional(),
};

/** Payload for `POST /investments`. `name`, `type`, `investedAmount` are required. */
export const createInvestmentSchema = z.object(investmentFields);

export type CreateInvestmentInput = z.infer<typeof createInvestmentSchema>;

/** Payload for `PATCH /investments/:id` — typically to refresh `currentValue`. */
export const updateInvestmentSchema = z.object(investmentFields).partial();

export type UpdateInvestmentInput = z.infer<typeof updateInvestmentSchema>;

/** Query for `GET /investments` — pagination plus type / active-only filters. */
export const listInvestmentsQuerySchema = paginationQuerySchema.extend({
  type: z.nativeEnum(InvestmentType).optional(),
  activeOnly: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
});

export type ListInvestmentsQuery = z.infer<typeof listInvestmentsQuerySchema>;
