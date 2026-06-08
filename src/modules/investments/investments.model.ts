import { model, Schema, type Types } from 'mongoose';
import type { BaseDocument } from '../../database/base.repository';
import { InvestmentType } from './investments.enums';

/**
 * A single investment holding owned by one user (a mutual fund, stock, FD, gold,
 * crypto, …). `investedAmount` is the cost basis; `currentValue` is the latest
 * market value (updated by the user, since live price feeds aren't wired yet).
 * Gain/loss and the portfolio allocation are computed on read. This is a simple
 * net-worth tracker, not a trading/holdings-reconciliation system.
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
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

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
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true, collection: 'investments' },
);

// The primary access pattern: a user's active holdings.
investmentSchema.index({ userId: 1, isActive: 1 });

export const InvestmentModel = model<InvestmentDocument>('Investment', investmentSchema);
