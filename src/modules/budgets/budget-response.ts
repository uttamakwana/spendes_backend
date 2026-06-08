import type { BudgetPeriod } from '../../common/enums/budget-period';
import type { DateWindow } from './budget-period.util';
import type { BudgetDocument } from './budgets.model';

/** How a budget is tracking against its limit for the active period. */
export type BudgetStatus = 'ok' | 'warning' | 'exceeded';

const round2 = (value: number): number => Math.round(value * 100) / 100;

/**
 * Public shape of a budget, including the live computed view for the active period:
 * the resolved window, how much has been spent, what remains, the percent used, and
 * a derived ok/warning/exceeded status (warning once `alertThresholdPct` is reached).
 */
export interface BudgetResponse {
  id: string;
  userId: string;
  name?: string;
  category?: string;
  amount: number;
  currency: string;
  period: BudgetPeriod;
  startDate?: Date;
  endDate?: Date;
  alertThresholdPct: number;
  isActive: boolean;
  periodStart: Date;
  periodEnd: Date;
  spent: number;
  remaining: number;
  percentUsed: number;
  status: BudgetStatus;
  createdAt: Date;
  updatedAt: Date;
}

/** Maps a budget document plus its computed window and spend to the public response. */
export function toBudgetResponse(
  budget: BudgetDocument,
  window: DateWindow,
  spent: number,
): BudgetResponse {
  const amount = budget.amount;
  const threshold = budget.alertThresholdPct ?? 80;
  const percentUsed = amount > 0 ? round2((spent / amount) * 100) : 0;
  const status: BudgetStatus =
    percentUsed >= 100 ? 'exceeded' : percentUsed >= threshold ? 'warning' : 'ok';

  return {
    id: budget._id.toString(),
    userId: budget.userId.toString(),
    name: budget.name,
    category: budget.category,
    amount,
    currency: budget.currency,
    period: budget.period,
    startDate: budget.startDate,
    endDate: budget.endDate,
    alertThresholdPct: threshold,
    isActive: budget.isActive,
    periodStart: window.from,
    periodEnd: window.to,
    spent: round2(spent),
    remaining: round2(amount - spent),
    percentUsed,
    status,
    createdAt: budget.createdAt,
    updatedAt: budget.updatedAt,
  };
}
