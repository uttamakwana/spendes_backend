import { createLogger } from '../../logger';
import { BudgetPeriod } from '../../common/enums/budget-period';
import { resolvePeriodWindow } from '../budgets/budget-period.util';
import { expensesRepository } from '../expenses/expenses.repository';
import { expensesService } from '../expenses/expenses.service';
import { incomeRepository } from '../income/income.repository';
import { incomeService } from '../income/income.service';
import { emisService } from '../emis/emis.service';
import { investmentsService } from '../investments/investments.service';
import { goalsRepository } from '../goals/goals.repository';
import type {
  AnalyticsOverviewResponse,
  CashflowPoint,
  CashflowResponse,
} from './analytics-response';

const round2 = (value: number): number => Math.round(value * 100) / 100;

/**
 * Read-only analytics that compose the other modules into dashboards. No storage of
 * its own — everything is derived on demand from expenses, income, EMIs, investments
 * and goals. This is the "so what" layer that makes the rest of the data worth
 * entering: a monthly snapshot and an income-vs-expense trend.
 */
export class AnalyticsService {
  private readonly logger = createLogger('AnalyticsService');

  /** The home-dashboard snapshot for the current month plus standing-balance figures. */
  async overview(userId: string): Promise<AnalyticsOverviewResponse> {
    const now = new Date();
    const window = resolvePeriodWindow(BudgetPeriod.Monthly, now);
    const range = { from: window.from, to: window.to };

    const [expenseSummary, incomeSummary, emiSummary, portfolio, goalsSaved] = await Promise.all([
      expensesService.summary(userId, range),
      incomeService.summary(userId, range),
      emisService.summary(userId),
      investmentsService.summary(userId),
      goalsRepository.sumCurrentAmount(userId),
    ]);

    const income = round2(incomeSummary.totalAmount);
    const expense = round2(expenseSummary.totalAmount);
    const net = round2(income - expense);
    const savingsRate = income > 0 ? round2((net / income) * 100) : 0;

    const assets = round2(portfolio.totalCurrentValue + goalsSaved);
    const liabilities = round2(emiSummary.totalOutstanding);

    return {
      period: range,
      income,
      expense,
      net,
      savingsRate,
      topCategories: expenseSummary.byCategory
        .slice(0, 5)
        .map((c) => ({ category: c.category, totalAmount: c.totalAmount })),
      commitments: {
        totalMonthlyCommitment: emiSummary.totalMonthlyCommitment,
        dueThisMonthCount: emiSummary.dueThisMonth.count,
        dueThisMonthTotal: emiSummary.dueThisMonth.total,
      },
      portfolio: {
        totalInvested: portfolio.totalInvested,
        totalCurrentValue: portfolio.totalCurrentValue,
        totalGainLoss: portfolio.totalGainLoss,
        gainLossPct: portfolio.gainLossPct,
      },
      netWorth: {
        assets,
        liabilities,
        net: round2(assets - liabilities),
      },
    };
  }

  /** Income vs expense for each of the trailing `months` (oldest → newest). */
  async cashflow(userId: string, months: number): Promise<CashflowResponse> {
    const now = new Date();
    const from = new Date(now.getFullYear(), now.getMonth() - (months - 1), 1, 0, 0, 0, 0);
    const to = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    const range = { from, to };

    const [expenseMonths, incomeMonths] = await Promise.all([
      expensesRepository.monthlyTotals(userId, range),
      incomeRepository.monthlyTotals(userId, range),
    ]);

    const expenseByKey = new Map(expenseMonths.map((r) => [`${r.year}-${r.month}`, r.total]));
    const incomeByKey = new Map(incomeMonths.map((r) => [`${r.year}-${r.month}`, r.total]));

    const series: CashflowPoint[] = [];
    for (let i = months - 1; i >= 0; i -= 1) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const year = d.getFullYear();
      const month = d.getMonth() + 1;
      const key = `${year}-${month}`;
      const incomeValue = round2(incomeByKey.get(key) ?? 0);
      const expenseValue = round2(expenseByKey.get(key) ?? 0);
      series.push({
        year,
        month,
        label: `${year}-${String(month).padStart(2, '0')}`,
        income: incomeValue,
        expense: expenseValue,
        net: round2(incomeValue - expenseValue),
      });
    }

    const totalIncome = round2(series.reduce((sum, p) => sum + p.income, 0));
    const totalExpense = round2(series.reduce((sum, p) => sum + p.expense, 0));

    return {
      months,
      from,
      to,
      series,
      totalIncome,
      totalExpense,
      net: round2(totalIncome - totalExpense),
    };
  }
}

/** Shared singleton instance used across the app. */
export const analyticsService = new AnalyticsService();
