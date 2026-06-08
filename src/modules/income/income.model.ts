import { model, Schema, type Types } from 'mongoose';
import { PaymentMethod } from '../../common/enums/payment-method';
import type { BaseDocument } from '../../database/base.repository';

/**
 * A single income entry owned by exactly one user — money coming in (salary,
 * freelance, refunds, interest, gifts, …). `userId` scopes every read and write,
 * so there is no cross-user access at this layer (see {@link IncomeService}).
 *
 * `amount` is stored in the major currency unit (e.g. rupees, not paise) as a
 * positive number; `currency` is the ISO-4217 code it is denominated in (defaults
 * to the owner's `defaultCurrency`). `receivedAt` is when the money actually
 * arrived and is distinct from `createdAt` (when the record was entered) — lists
 * and summaries sort/range on `receivedAt`.
 *
 * `source` is the payer (employer, client, bank). `receivedVia` reuses the shared
 * {@link PaymentMethod} enum (the channel the money came in through). `isRecurring`
 * is a lightweight flag only — the real recurring/scheduling engine is a later
 * module; for now it just marks entries the user expects to repeat (e.g. salary).
 *
 * `category` is a free-form label for now. When expense ↔ category linking lands it
 * becomes a reference (`categoryId`, type=income) with this kept as a denormalized
 * display label — done together with expenses so both modules stay consistent.
 */
export interface IncomeDocument extends BaseDocument {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
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

const incomeSchema = new Schema<IncomeDocument>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    amount: { type: Number, required: true, min: 0 },
    currency: { type: String, required: true, uppercase: true, trim: true, default: 'INR' },
    category: { type: String, required: true, trim: true },
    source: { type: String, trim: true },
    description: { type: String, trim: true },
    receivedVia: {
      type: String,
      enum: Object.values(PaymentMethod),
      default: PaymentMethod.BankTransfer,
    },
    receivedAt: { type: Date, required: true, default: () => new Date() },
    notes: { type: String, trim: true },
    tags: { type: [String], default: [] },
    isRecurring: { type: Boolean, default: false },
  },
  { timestamps: true, collection: 'incomes' },
);

// The primary access pattern: a user's income, newest received first.
incomeSchema.index({ userId: 1, receivedAt: -1 });

// Category-wise analysis for a user (breakdowns, filtered lists).
incomeSchema.index({ userId: 1, category: 1 });

export const IncomeModel = model<IncomeDocument>('Income', incomeSchema);
