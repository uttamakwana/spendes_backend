import { model, Schema, type Types } from 'mongoose';
import { PaymentMethod } from '../../common/enums/payment-method';
import type { BaseDocument } from '../../database/base.repository';

/**
 * A single personal expense owned by exactly one user. `userId` scopes every read
 * and write — there is no cross-user access at this layer (see {@link ExpensesService}).
 *
 * `amount` is stored in the major currency unit (e.g. rupees, not paise) as a
 * positive number; `currency` is the ISO-4217 code it is denominated in (defaults to
 * the owner's `defaultCurrency`). `spentAt` is when the money was actually spent and
 * is distinct from `createdAt` (when the record was entered) — lists and summaries
 * sort/range on `spentAt`.
 *
 * `category` is a free-form label for now. When the dedicated categories module lands
 * it becomes a reference (`categoryId`) with this kept as a denormalized display label.
 */
export interface ExpenseDocument extends BaseDocument {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
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
  createdAt: Date;
  updatedAt: Date;
}

const expenseSchema = new Schema<ExpenseDocument>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    amount: { type: Number, required: true, min: 0 },
    currency: { type: String, required: true, uppercase: true, trim: true, default: 'INR' },
    category: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    merchant: { type: String, trim: true },
    paymentMethod: {
      type: String,
      enum: Object.values(PaymentMethod),
      default: PaymentMethod.Other,
    },
    spentAt: { type: Date, required: true, default: () => new Date() },
    notes: { type: String, trim: true },
    tags: { type: [String], default: [] },
    receiptUrl: { type: String, trim: true },
  },
  { timestamps: true, collection: 'expenses' },
);

// The primary access pattern: a user's expenses, newest spend first.
expenseSchema.index({ userId: 1, spentAt: -1 });

// Category-wise analysis for a user (breakdowns, filtered lists).
expenseSchema.index({ userId: 1, category: 1 });

export const ExpenseModel = model<ExpenseDocument>('Expense', expenseSchema);
