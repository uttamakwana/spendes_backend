import { model, Schema, type Types } from 'mongoose';
import type { BaseDocument } from '../../database/base.repository';
import { InvestmentType, SipFrequency } from './investments.enums';

/** A single contribution into a holding (the initial buy, or one SIP installment). */
export interface InvestmentContribution {
  _id: Types.ObjectId;
  amount: number;
  note?: string;
  investedAt: Date;
}

/**
 * A recurring contribution plan (a SIP). The static facts are stored — the
 * per-installment `amount`, the `frequency`, and the first-due `startDate` (whose
 * day-of-month is "the date it debits"). The live schedule (next due date, how many
 * installments are expected by now) is computed on read. Recording each installment
 * is manual via the contribute endpoint; auto-posting arrives with the recurring
 * engine, same as EMIs.
 */
export interface SipPlan {
  amount: number;
  frequency: SipFrequency;
  startDate: Date;
  isActive: boolean;
}

/**
 * A single investment holding owned by one user (a mutual fund, stock, FD, gold,
 * crypto, …). `investedAmount` is the cost basis — kept as the denormalized sum of
 * `contributions` (the initial buy plus any SIP installments recorded since).
 * `currentValue` is the latest market value (updated by the user, since live price
 * feeds aren't wired yet). An optional `sip` plan captures a recurring contribution
 * (monthly/quarterly/…) on a chosen date. Gain/loss, the SIP schedule, and the
 * portfolio allocation are computed on read. This is a net-worth + SIP tracker, not a
 * trading/holdings-reconciliation system.
 */
export interface InvestmentDocument extends BaseDocument {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  name: string;
  type: InvestmentType;
  investedAmount: number;
  currentValue: number;
  currency: string;
  quantity?: number;
  platform?: string;
  notes?: string;
  sip?: SipPlan;
  contributions: InvestmentContribution[];
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const contributionSchema = new Schema<InvestmentContribution>(
  {
    amount: { type: Number, required: true, min: 0 },
    note: { type: String, trim: true },
    investedAt: { type: Date, default: () => new Date() },
  },
  { _id: true },
);

const sipSchema = new Schema<SipPlan>(
  {
    amount: { type: Number, required: true, min: 0 },
    frequency: {
      type: String,
      enum: Object.values(SipFrequency),
      default: SipFrequency.Monthly,
    },
    startDate: { type: Date, required: true },
    isActive: { type: Boolean, default: true },
  },
  { _id: false },
);

const investmentSchema = new Schema<InvestmentDocument>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name: { type: String, required: true, trim: true },
    type: { type: String, enum: Object.values(InvestmentType), default: InvestmentType.Other },
    investedAmount: { type: Number, required: true, min: 0 },
    currentValue: { type: Number, required: true, min: 0 },
    currency: { type: String, required: true, uppercase: true, trim: true, default: 'INR' },
    quantity: { type: Number, min: 0 },
    platform: { type: String, trim: true },
    notes: { type: String, trim: true },
    sip: { type: sipSchema, default: undefined },
    contributions: { type: [contributionSchema], default: [] },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true, collection: 'investments' },
);

// The primary access pattern: a user's active holdings.
investmentSchema.index({ userId: 1, isActive: 1 });

export const InvestmentModel = model<InvestmentDocument>('Investment', investmentSchema);
