import type { PaymentMethod } from '../../common/enums/payment-method';
import type { IncomeDocument } from './income.model';

/**
 * The public-facing representation of an income entry. Built explicitly via
 * {@link toIncomeResponse} so the API shape stays decoupled from the persistence
 * model (ObjectIds become strings; new internal fields don't leak by default).
 */
export interface IncomeResponse {
  id: string;
  userId: string;
  amount: number;
  currency: string;
  category: string;
  source?: string;
  description?: string;
  receivedVia: PaymentMethod;
  receivedAt: Date;
  notes?: string;
  tags: string[];
  isRecurring: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/** Maps a raw income document to its public response shape. */
export function toIncomeResponse(income: IncomeDocument): IncomeResponse {
  return {
    id: income._id.toString(),
    userId: income.userId.toString(),
    amount: income.amount,
    currency: income.currency,
    category: income.category,
    source: income.source,
    description: income.description,
    receivedVia: income.receivedVia,
    receivedAt: income.receivedAt,
    notes: income.notes,
    tags: income.tags ?? [],
    isRecurring: income.isRecurring,
    createdAt: income.createdAt,
    updatedAt: income.updatedAt,
  };
}
