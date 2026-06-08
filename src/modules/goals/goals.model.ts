import { model, Schema, type Types } from 'mongoose';
import type { BaseDocument } from '../../database/base.repository';

/** A single deposit toward a goal, kept for history. */
export interface GoalContribution {
  _id: Types.ObjectId;
  amount: number;
  note?: string;
  contributedAt: Date;
}

/**
 * A savings goal owned by one user (a trip, a phone, an emergency fund). `targetAmount`
 * is what they're saving toward; `currentAmount` is the running total of
 * `contributions` (kept denormalized so reads are cheap). Progress, remaining, and
 * the "save ₹X/month to reach it on time" figure are computed on read from
 * `targetDate`. Icon + color render in the app with no asset pipeline (same approach
 * as categories).
 */
export interface GoalDocument extends BaseDocument {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  name: string;
  targetAmount: number;
  currentAmount: number;
  currency: string;
  targetDate?: Date;
  icon?: string;
  color?: string;
  notes?: string;
  contributions: GoalContribution[];
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const contributionSchema = new Schema<GoalContribution>(
  {
    amount: { type: Number, required: true, min: 0 },
    note: { type: String, trim: true },
    contributedAt: { type: Date, default: () => new Date() },
  },
  { _id: true },
);

const goalSchema = new Schema<GoalDocument>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name: { type: String, required: true, trim: true },
    targetAmount: { type: Number, required: true, min: 0 },
    currentAmount: { type: Number, default: 0, min: 0 },
    currency: { type: String, required: true, uppercase: true, trim: true, default: 'INR' },
    targetDate: { type: Date },
    icon: { type: String, trim: true },
    color: { type: String, trim: true },
    notes: { type: String, trim: true },
    contributions: { type: [contributionSchema], default: [] },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true, collection: 'goals' },
);

// The primary access pattern: a user's active goals.
goalSchema.index({ userId: 1, isActive: 1 });

export const GoalModel = model<GoalDocument>('Goal', goalSchema);
