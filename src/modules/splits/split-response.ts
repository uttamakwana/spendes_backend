import type { PaymentMethod } from '../../common/enums/payment-method';
import type { GroupExpenseDocument } from './group-expense.model';
import type { SettlementDocument } from './settlement.model';
import type { SplitStrategy } from './splits.enums';

export interface ExpensePayerResponse {
  memberId: string;
  amount: number;
}

export interface ExpenseSplitResponse {
  memberId: string;
  amount: number;
  percentage?: number;
  shares?: number;
}

export interface GroupExpenseResponse {
  id: string;
  groupId: string;
  description: string;
  amount: number;
  currency: string;
  category?: string;
  paidBy: ExpensePayerResponse[];
  splitStrategy: SplitStrategy;
  splits: ExpenseSplitResponse[];
  spentAt: Date;
  notes?: string;
  createdByMemberId: string;
  createdByUserId: string;
  createdAt: Date;
  updatedAt: Date;
}

/** Maps a raw group expense document to its public response shape. */
export function toGroupExpenseResponse(expense: GroupExpenseDocument): GroupExpenseResponse {
  return {
    id: expense._id.toString(),
    groupId: expense.groupId.toString(),
    description: expense.description,
    amount: expense.amount,
    currency: expense.currency,
    category: expense.category,
    paidBy: expense.paidBy.map((p) => ({ memberId: p.memberId.toString(), amount: p.amount })),
    splitStrategy: expense.splitStrategy,
    splits: expense.splits.map((s) => ({
      memberId: s.memberId.toString(),
      amount: s.amount,
      percentage: s.percentage,
      shares: s.shares,
    })),
    spentAt: expense.spentAt,
    notes: expense.notes,
    createdByMemberId: expense.createdByMemberId.toString(),
    createdByUserId: expense.createdByUserId.toString(),
    createdAt: expense.createdAt,
    updatedAt: expense.updatedAt,
  };
}

export interface SettlementResponse {
  id: string;
  groupId: string;
  fromMemberId: string;
  toMemberId: string;
  amount: number;
  currency: string;
  method: PaymentMethod;
  note?: string;
  reference?: string;
  settledAt: Date;
  createdByUserId: string;
  createdAt: Date;
  updatedAt: Date;
}

/** Maps a raw settlement document to its public response shape. */
export function toSettlementResponse(settlement: SettlementDocument): SettlementResponse {
  return {
    id: settlement._id.toString(),
    groupId: settlement.groupId.toString(),
    fromMemberId: settlement.fromMemberId.toString(),
    toMemberId: settlement.toMemberId.toString(),
    amount: settlement.amount,
    currency: settlement.currency,
    method: settlement.method,
    note: settlement.note,
    reference: settlement.reference,
    settledAt: settlement.settledAt,
    createdByUserId: settlement.createdByUserId.toString(),
    createdAt: settlement.createdAt,
    updatedAt: settlement.updatedAt,
  };
}

/** One member's net position in a group. */
export interface MemberBalance {
  memberId: string;
  displayName: string;
  /** Positive = owed to them; negative = they owe; in major currency units. */
  net: number;
}

/** A suggested "who pays whom" transfer that helps zero everyone out. */
export interface SuggestedTransfer {
  fromMemberId: string;
  fromName: string;
  toMemberId: string;
  toName: string;
  amount: number;
}

/** Result of `GET /groups/:groupId/balances`. */
export interface GroupBalancesResponse {
  groupId: string;
  currency: string;
  balances: MemberBalance[];
  suggestedTransfers: SuggestedTransfer[];
  /** The requesting member's net, if they are in the group. */
  myNet?: number;
  myMemberId?: string;
}

/** The UPI payment instruction returned by the settle-up intent endpoint. */
export interface SettlementIntentResponse {
  provider: string;
  uri: string;
  toMemberId: string;
  payeeName: string;
  payeeVpa: string;
  amount: number;
  currency: string;
  note?: string;
  /** Transaction reference baked into the intent; pass it back when recording the settlement. */
  reference: string;
}
