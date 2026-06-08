import { SplitStrategy } from './splits.enums';

/**
 * Pure money math for splits, done entirely in integer paise so floating-point
 * drift can never make splits fail to add up to the total. Major-unit rupee values
 * cross the boundary only at the edges (`toPaise`/`toMajor`).
 */

const toPaise = (major: number): number => Math.round(major * 100);
const toMajor = (paise: number): number => paise / 100;

export interface SplitInputEntry {
  memberId: string;
  exactAmount?: number;
  percentage?: number;
  shares?: number;
}

export interface ComputedSplit {
  memberId: string;
  amount: number;
  percentage?: number;
  shares?: number;
}

/**
 * Splits `totalPaise` across `weights` proportionally using the largest-remainder
 * method, guaranteeing the parts sum to exactly `totalPaise` (leftover paise go to
 * the entries with the largest fractional remainder, ties broken by order).
 */
export function distributeByWeights(totalPaise: number, weights: number[]): number[] {
  const sum = weights.reduce((acc, w) => acc + w, 0);
  if (sum <= 0) {
    // Degenerate (all-zero) weights: fall back to an even split.
    return distributeByWeights(
      totalPaise,
      weights.map(() => 1),
    );
  }

  const raw = weights.map((w) => (totalPaise * w) / sum);
  const floors = raw.map((r) => Math.floor(r));
  const remainder = totalPaise - floors.reduce((acc, f) => acc + f, 0);

  const byFraction = raw
    .map((r, i) => ({ i, frac: r - Math.floor(r) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);

  for (let k = 0; k < remainder; k += 1) {
    floors[byFraction[k].i] += 1;
  }
  return floors;
}

/** Resolves each member's owed amount (major units, 2dp) for the chosen strategy. */
export function computeSplits(
  amount: number,
  strategy: SplitStrategy,
  entries: SplitInputEntry[],
): ComputedSplit[] {
  if (strategy === SplitStrategy.Exact) {
    return entries.map((e) => ({
      memberId: e.memberId,
      amount: toMajor(toPaise(e.exactAmount ?? 0)),
    }));
  }

  const weights =
    strategy === SplitStrategy.Percentage
      ? entries.map((e) => e.percentage ?? 0)
      : strategy === SplitStrategy.Shares
        ? entries.map((e) => e.shares ?? 0)
        : entries.map(() => 1); // Equal

  const paise = distributeByWeights(toPaise(amount), weights);
  return entries.map((e, idx) => ({
    memberId: e.memberId,
    amount: toMajor(paise[idx]),
    percentage: strategy === SplitStrategy.Percentage ? e.percentage : undefined,
    shares: strategy === SplitStrategy.Shares ? e.shares : undefined,
  }));
}

export interface PayerShare {
  memberId: string;
  amount: number;
}

export interface ExpenseForBalance {
  paidBy: PayerShare[];
  splits: { memberId: string; amount: number }[];
}

export interface SettlementForBalance {
  fromMemberId: string;
  toMemberId: string;
  amount: number;
}

/**
 * Net position per member, in paise: positive = others owe them (they fronted more
 * than they consumed), negative = they owe. Summing all expenses (paid − owed) and
 * settlements (a payment moves the payer toward zero and the payee away from being
 * owed). Across a consistent group the nets always sum to zero.
 */
export function computeNetBalances(
  memberIds: string[],
  expenses: ExpenseForBalance[],
  settlements: SettlementForBalance[],
): Map<string, number> {
  const net = new Map<string, number>();
  memberIds.forEach((id) => net.set(id, 0));
  const add = (id: string, paise: number): void => {
    net.set(id, (net.get(id) ?? 0) + paise);
  };

  for (const expense of expenses) {
    for (const payer of expense.paidBy) {
      add(payer.memberId, toPaise(payer.amount));
    }
    for (const split of expense.splits) {
      add(split.memberId, -toPaise(split.amount));
    }
  }

  for (const settlement of settlements) {
    add(settlement.fromMemberId, toPaise(settlement.amount));
    add(settlement.toMemberId, -toPaise(settlement.amount));
  }

  return net;
}

export interface SimplifiedDebt {
  fromMemberId: string;
  toMemberId: string;
  amount: number;
}

/**
 * Greedy debt simplification: repeatedly settle the largest debtor against the
 * largest creditor, minimizing the number of "who pays whom" transfers needed to
 * zero everyone out. Input is the paise net map; output amounts are major units.
 */
export function simplifyDebts(net: Map<string, number>): SimplifiedDebt[] {
  const debtors: { id: string; amount: number }[] = [];
  const creditors: { id: string; amount: number }[] = [];

  for (const [id, paise] of net) {
    if (paise < 0) {
      debtors.push({ id, amount: -paise });
    } else if (paise > 0) {
      creditors.push({ id, amount: paise });
    }
  }

  debtors.sort((a, b) => b.amount - a.amount);
  creditors.sort((a, b) => b.amount - a.amount);

  const transfers: SimplifiedDebt[] = [];
  let i = 0;
  let j = 0;
  while (i < debtors.length && j < creditors.length) {
    const pay = Math.min(debtors[i].amount, creditors[j].amount);
    if (pay > 0) {
      transfers.push({
        fromMemberId: debtors[i].id,
        toMemberId: creditors[j].id,
        amount: toMajor(pay),
      });
    }
    debtors[i].amount -= pay;
    creditors[j].amount -= pay;
    if (debtors[i].amount === 0) {
      i += 1;
    }
    if (creditors[j].amount === 0) {
      j += 1;
    }
  }

  return transfers;
}
