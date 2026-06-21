import { z } from 'zod';
import { paginationQuerySchema } from '../../common/utils/pagination';
import { InvestmentType, SipFrequency } from './investments.enums';

/** A recurring contribution plan (SIP): per-installment amount, cadence, first date. */
const sipSchema = z.object({
  amount: z.number().positive().max(1_000_000_000),
  frequency: z.nativeEnum(SipFrequency).default(SipFrequency.Monthly),
  startDate: z.coerce.date(),
  isActive: z.boolean().optional(),
});

/**
 * The editable fields of a holding, shared by create and update. `currentValue`
 * defaults to `investedAmount` on create (zero gain/loss until the user updates it).
 * `sip` is optional — present only for a holding funded by a recurring plan.
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
  sip: sipSchema.optional(),
  isActive: z.boolean().optional(),
};

/** Payload for `POST /investments`. `name`, `type`, `investedAmount` are required. */
export const createInvestmentSchema = z.object(investmentFields);

export type CreateInvestmentInput = z.infer<typeof createInvestmentSchema>;

/** Payload for `PATCH /investments/:id` — e.g. refresh `currentValue` or edit the SIP. */
export const updateInvestmentSchema = z.object(investmentFields).partial();

export type UpdateInvestmentInput = z.infer<typeof updateInvestmentSchema>;

/**
 * Payload for `POST /investments/:id/contribute` — record one contribution (a SIP
 * installment or an ad-hoc top-up). May also refresh `currentValue` in the same call,
 * since recording a SIP is the natural moment to update the latest market value.
 */
export const contributeInvestmentSchema = z.object({
  amount: z.number().positive().max(1_000_000_000),
  note: z.string().trim().max(1000).optional(),
  investedAt: z.coerce.date().optional(),
  currentValue: z.number().nonnegative().max(1_000_000_000_000).optional(),
});

export type ContributeInvestmentInput = z.infer<typeof contributeInvestmentSchema>;

/** Query for `GET /investments` — pagination plus type / active-only filters. */
export const listInvestmentsQuerySchema = paginationQuerySchema.extend({
  type: z.nativeEnum(InvestmentType).optional(),
  activeOnly: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
});

export type ListInvestmentsQuery = z.infer<typeof listInvestmentsQuerySchema>;
