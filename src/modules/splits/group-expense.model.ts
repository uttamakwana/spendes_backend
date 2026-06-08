import { model, Schema, type Types } from 'mongoose';
import type { BaseDocument } from '../../database/base.repository';
import { SplitStrategy } from './splits.enums';

/** One payer's contribution to a group expense (`memberId` is a group member subdoc id). */
export interface ExpensePayer {
  memberId: Types.ObjectId;
  amount: number;
}

/** One member's owed portion of a group expense; raw `percentage`/`shares` kept for display. */
export interface ExpenseSplit {
  memberId: Types.ObjectId;
  amount: number;
  percentage?: number;
  shares?: number;
}

/**
 * A shared expense logged inside a group: who paid (`paidBy`) and how the total is
 * owed (`splits`), resolved from the chosen {@link SplitStrategy}. All member
 * references are group member subdocument ids (not user ids), so an invited-by-phone
 * placeholder can owe or be owed before they ever install the app. The split amounts
 * are pre-resolved (and always sum to `amount`) so balance math is a straight sum.
 */
export interface GroupExpenseDocument extends BaseDocument {
  _id: Types.ObjectId;
  groupId: Types.ObjectId;
  description: string;
  amount: number;
  currency: string;
  category?: string;
  paidBy: ExpensePayer[];
  splitStrategy: SplitStrategy;
  splits: ExpenseSplit[];
  spentAt: Date;
  notes?: string;
  /** The group member who logged this expense. */
  createdByMemberId: Types.ObjectId;
  /** The user account that logged it — used for edit/delete permission. */
  createdByUserId: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const payerSchema = new Schema<ExpensePayer>(
  {
    memberId: { type: Schema.Types.ObjectId, required: true },
    amount: { type: Number, required: true, min: 0 },
  },
  { _id: false },
);

const splitSchema = new Schema<ExpenseSplit>(
  {
    memberId: { type: Schema.Types.ObjectId, required: true },
    amount: { type: Number, required: true, min: 0 },
    percentage: { type: Number },
    shares: { type: Number },
  },
  { _id: false },
);

const groupExpenseSchema = new Schema<GroupExpenseDocument>(
  {
    groupId: { type: Schema.Types.ObjectId, ref: 'Group', required: true, index: true },
    description: { type: String, required: true, trim: true },
    amount: { type: Number, required: true, min: 0 },
    currency: { type: String, required: true, uppercase: true, trim: true, default: 'INR' },
    category: { type: String, trim: true },
    paidBy: { type: [payerSchema], required: true },
    splitStrategy: { type: String, enum: Object.values(SplitStrategy), required: true },
    splits: { type: [splitSchema], required: true },
    spentAt: { type: Date, required: true, default: () => new Date() },
    notes: { type: String, trim: true },
    createdByMemberId: { type: Schema.Types.ObjectId, required: true },
    createdByUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true, collection: 'group_expenses' },
);

// Primary access pattern: a group's expenses, newest first.
groupExpenseSchema.index({ groupId: 1, spentAt: -1 });

export const GroupExpenseModel = model<GroupExpenseDocument>('GroupExpense', groupExpenseSchema);
