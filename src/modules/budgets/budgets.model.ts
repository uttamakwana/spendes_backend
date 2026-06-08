import { model, Schema, type Types } from 'mongoose';
import { BudgetPeriod } from '../../common/enums/budget-period';
import type { BaseDocument } from '../../database/base.repository';

/**
 * A spending limit owned by one user. `category` scopes it to a single expense
 * category; when absent the budget is an overall cap across all spending. "Spent"
 * is never stored — it is computed on read from the user's expenses in the active
 * period (which already include materialized group/friend shares), so budgets stay
 * correct without any write-time bookkeeping. `alertThresholdPct` drives the
 * ok/warning/exceeded status in the response.
 */
export interface BudgetDocument extends BaseDocument {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  name?: string;
  category?: string;
  amount: number;
  currency: string;
  period: BudgetPeriod;
  /** Required only for a custom period. */
  startDate?: Date;
  endDate?: Date;
  alertThresholdPct: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const budgetSchema = new Schema<BudgetDocument>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name: { type: String, trim: true },
    category: { type: String, trim: true },
    amount: { type: Number, required: true, min: 0 },
    currency: { type: String, required: true, uppercase: true, trim: true, default: 'INR' },
    period: { type: String, enum: Object.values(BudgetPeriod), required: true },
    startDate: { type: Date },
    endDate: { type: Date },
    alertThresholdPct: { type: Number, default: 80, min: 1, max: 100 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true, collection: 'budgets' },
);

// The primary access pattern: a user's active budgets.
budgetSchema.index({ userId: 1, isActive: 1 });

export const BudgetModel = model<BudgetDocument>('Budget', budgetSchema);
