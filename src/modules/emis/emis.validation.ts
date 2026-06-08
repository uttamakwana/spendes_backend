import { z } from 'zod';
import { PaymentMethod } from '../../common/enums/payment-method';
import { paginationQuerySchema } from '../../common/utils/pagination';
import { EmiFrequency, EmiType } from './emis.enums';

/**
 * The editable fields of a recurring obligation, shared by create and update.
 * `amount` is the per-installment value; `tenureCount` makes it finite (a loan),
 * its absence means it recurs indefinitely (a subscription).
 */
const emiFields = {
  name: z.string().trim().min(1).max(100),
  type: z.nativeEnum(EmiType),
  amount: z.number().positive().max(1_000_000_000_000),
  currency: z
    .string()
    .trim()
    .regex(/^[A-Za-z]{3}$/, 'currency must be a 3-letter ISO code')
    .optional(),
  frequency: z.nativeEnum(EmiFrequency),
  startDate: z.coerce.date(),
  category: z.string().trim().min(1).max(50).optional(),
  paymentMethod: z.nativeEnum(PaymentMethod).optional(),
  interestRatePct: z.number().min(0).max(100).optional(),
  principal: z.number().positive().max(1_000_000_000_000).optional(),
  tenureCount: z.number().int().min(1).max(1200).optional(),
  autoDebit: z.boolean().optional(),
  isActive: z.boolean().optional(),
  notes: z.string().trim().max(1000).optional(),
};

/** Payload for `POST /emis`. `name`, `type`, `amount`, `frequency`, `startDate` are required. */
export const createEmiSchema = z.object(emiFields);

export type CreateEmiInput = z.infer<typeof createEmiSchema>;

/** Payload for `PATCH /emis/:id`. Every field is optional. */
export const updateEmiSchema = z.object(emiFields).partial();

export type UpdateEmiInput = z.infer<typeof updateEmiSchema>;

/** Query for `GET /emis` — pagination plus type / active-only filters. */
export const listEmisQuerySchema = paginationQuerySchema.extend({
  type: z.nativeEnum(EmiType).optional(),
  activeOnly: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
});

export type ListEmisQuery = z.infer<typeof listEmisQuerySchema>;
