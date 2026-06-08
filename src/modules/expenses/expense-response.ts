import type { PaymentMethod } from '../../common/enums/payment-method';
import type { ExpenseSource } from '../../common/enums/expense-source';
import type { ExpenseDocument } from './expenses.model';

/**
 * The public-facing representation of an expense. Built explicitly via
 * {@link toExpenseResponse} so the API shape stays decoupled from the persistence
 * model (ObjectIds become strings; new internal fields don't leak by default).
 */
export interface ExpenseResponse {
  id: string;
  userId: string;
  amount: number;
  currency: string;
  category: string;
  description?: string;
  merchant?: string;
  paymentMethod: PaymentMethod;
  spentAt: Date;
  notes?: string;
  tags: string[];
  receiptUrl?: string;
  source: ExpenseSource;
  groupId?: string;
  groupExpenseId?: string;
  createdAt: Date;
  updatedAt: Date;
}

/** Maps a raw expense document to its public response shape. */
export function toExpenseResponse(expense: ExpenseDocument): ExpenseResponse {
  return {
    id: expense._id.toString(),
    userId: expense.userId.toString(),
    amount: expense.amount,
    currency: expense.currency,
    category: expense.category,
    description: expense.description,
    merchant: expense.merchant,
    paymentMethod: expense.paymentMethod,
    spentAt: expense.spentAt,
    notes: expense.notes,
    tags: expense.tags ?? [],
    receiptUrl: expense.receiptUrl,
    source: expense.source,
    groupId: expense.groupId?.toString(),
    groupExpenseId: expense.groupExpenseId?.toString(),
    createdAt: expense.createdAt,
    updatedAt: expense.updatedAt,
  };
}
