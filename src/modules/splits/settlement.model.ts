import { model, Schema, type Types } from 'mongoose';
import { PaymentMethod } from '../../common/enums/payment-method';
import type { BaseDocument } from '../../database/base.repository';

/**
 * A recorded payment from one group member to another that settles part of a debt.
 * Because the UPI-intent rail gives no payment webhook, a settlement *is* the
 * "mark as paid" record the payer creates after paying (by UPI deep link or cash).
 * It shifts the two members' balances; the actual money moved outside the system.
 */
export interface SettlementDocument extends BaseDocument {
  _id: Types.ObjectId;
  groupId: Types.ObjectId;
  fromMemberId: Types.ObjectId;
  toMemberId: Types.ObjectId;
  amount: number;
  currency: string;
  method: PaymentMethod;
  note?: string;
  settledAt: Date;
  /** The user account that recorded the settlement. */
  createdByUserId: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const settlementSchema = new Schema<SettlementDocument>(
  {
    groupId: { type: Schema.Types.ObjectId, ref: 'Group', required: true, index: true },
    fromMemberId: { type: Schema.Types.ObjectId, required: true },
    toMemberId: { type: Schema.Types.ObjectId, required: true },
    amount: { type: Number, required: true, min: 0 },
    currency: { type: String, required: true, uppercase: true, trim: true, default: 'INR' },
    method: { type: String, enum: Object.values(PaymentMethod), default: PaymentMethod.Upi },
    note: { type: String, trim: true },
    settledAt: { type: Date, required: true, default: () => new Date() },
    createdByUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true, collection: 'settlements' },
);

// Primary access pattern: a group's settlements, newest first.
settlementSchema.index({ groupId: 1, settledAt: -1 });

export const SettlementModel = model<SettlementDocument>('Settlement', settlementSchema);
