import { model, Schema, type Types } from 'mongoose';
import { PaymentMethod } from '../../common/enums/payment-method';
import type { BaseDocument } from '../../database/base.repository';
import { EmiFrequency, EmiType } from './emis.enums';

/**
 * A recurring financial obligation owned by one user — a loan EMI, a subscription,
 * rent, insurance, etc. Only the static facts are stored (the installment `amount`,
 * `frequency`, first-due `startDate`, optional finite `tenureCount`); the live
 * schedule (next due date, installments paid/remaining, completion) is computed on
 * read. EMIs are informational for now — they are not auto-posted as expenses on
 * their due date; that arrives with the recurring-transactions engine.
 */
export interface EmiDocument extends BaseDocument {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  name: string;
  type: EmiType;
  amount: number;
  currency: string;
  frequency: EmiFrequency;
  startDate: Date;
  category?: string;
  paymentMethod?: PaymentMethod;
  interestRatePct?: number;
  principal?: number;
  /** Total number of installments for a finite obligation (e.g. a loan tenure). */
  tenureCount?: number;
  autoDebit: boolean;
  isActive: boolean;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const emiSchema = new Schema<EmiDocument>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name: { type: String, required: true, trim: true },
    type: { type: String, enum: Object.values(EmiType), default: EmiType.Other },
    amount: { type: Number, required: true, min: 0 },
    currency: { type: String, required: true, uppercase: true, trim: true, default: 'INR' },
    frequency: {
      type: String,
      enum: Object.values(EmiFrequency),
      default: EmiFrequency.Monthly,
    },
    startDate: { type: Date, required: true },
    category: { type: String, trim: true },
    paymentMethod: { type: String, enum: Object.values(PaymentMethod) },
    interestRatePct: { type: Number, min: 0 },
    principal: { type: Number, min: 0 },
    tenureCount: { type: Number, min: 1 },
    autoDebit: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
    notes: { type: String, trim: true },
  },
  { timestamps: true, collection: 'emis' },
);

// The primary access pattern: a user's active obligations.
emiSchema.index({ userId: 1, isActive: 1 });

export const EmiModel = model<EmiDocument>('Emi', emiSchema);
