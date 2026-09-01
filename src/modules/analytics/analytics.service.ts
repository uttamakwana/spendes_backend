import { createLogger } from '../../logger';
import { safeTimezone, zonedMonthWindow, zonedParts } from '../../common/utils/timezone';
import { usersService } from '../users/users.service';
import { BudgetPeriod } from '../../common/enums/budget-period';
import { resolvePeriodWindow } from '../budgets/budget-period.util';
import { expensesRepository } from '../expenses/expenses.repository';
import { expensesService } from '../expenses/expenses.service';
import { incomeRepository } from '../income/income.repository';
import { incomeService } from '../income/income.service';
import { emisService } from '../emis/emis.service';
import { investmentsService } from '../investments/investments.service';
import { balancesService } from '../balances/balances.service';
import { goalsRepository } from '../goals/goals.repository';
import { computeGoalMetrics } from '../goals/goal-progress.util';
import type { GoalDocument } from '../goals/goals.model';
import type {
  AnalyticsOverviewResponse,
  CashflowPoint,
  CashflowResponse,
  GoalFeasibilityItem,
  GoalFeasibilityResponse,
  MonthlyCapacity,
} from './analytics-response';

const round2 = (value: number): number => Math.round(value * 100) / 100;

/** Trailing months used to smooth income/expense into a monthly average for feasibility. */
const FEASIBILITY_BASIS_MONTHS = 3;

/**
 * Read-only analytics that compose the other modules into dashboards. No storage of
 * its own — everything is derived on demand from expenses, income, EMIs, investments,
 * goals and friend balances. This is the "so what" layer that makes the rest of the
 * data worth entering: a monthly snapshot, an income-vs-expense trend, and a
 * goal-feasibility read that ties earning, spending and commitments together.
 */
export class AnalyticsService {
  private readonly logger = createLogger('AnalyticsService');

  /** The home-dashboard snapshot for the current month plus standing-balance figures. */
  async overview(userId: string): Promise<AnalyticsOverviewResponse> {
    const now = new Date();
    const timezone = await this.resolveTimezone(userId);
    const window = resolvePeriodWindow(BudgetPeriod.Monthly, now, timezone);
    const range = { from: window.from, to: window.to };

    const [expenseSummary, incomeSummary, emiSummary, portfolio, activeGoals, averages, balances] =
      await Promise.all([
        expensesService.summary(userId, range),
        incomeService.summary(userId, range),
        emisService.summary(userId),
        investmentsService.summary(userId),
        goalsRepository.findActiveForUser(userId),
        this.monthlyAverages(userId, now, timezone),
        balancesService.summary(userId),
      ]);

    const income = round2(incomeSummary.totalAmount);
    const expense = round2(expenseSummary.totalAmount);
    const cashOutflow = round2(expenseSummary.cashOutflow);
    const net = round2(income - expense);
    const savingsRate = income > 0 ? round2((net / income) * 100) : 0;

    const feasibility = this.buildFeasibility(
      now,
      averages,
      emiSummary.totalMonthlyCommitment,
      portfolio.totalMonthlySip,
      activeGoals,
    );

    const goalsSaved = round2(activeGoals.reduce((sum, g) => sum + g.currentAmount, 0));
    const assets = round2(portfolio.totalCurrentValue + goalsSaved);
    const liabilities = round2(emiSummary.totalOutstanding);

    return {
      period: range,
      income,
      expense,
      cashOutflow,
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
        totalMonthlySip: portfolio.totalMonthlySip,
      },
      // Every friendship *and* every group, netted per person — money you fronted
      // for a flat is owed to you just as much as a one-on-one loan. Lifetime, not
      // this month: a debt from March is still a debt in September.
      balances: {
        youAreOwed: balances.youAreOwed,
        youOwe: balances.youOwe,
        net: balances.net,
      },
      goals: {
        activeCount: feasibility.totals.activeGoals,
        onTrackCount: feasibility.totals.onTrackCount,
        allOnTrack: feasibility.totals.allOnTrack,
        totalRequiredMonthlySaving: feasibility.totals.totalRequiredMonthlySaving,
        disposableForGoals: feasibility.monthly.disposableForGoals,
      },
      netWorth: {
        assets,
        liabilities,
        net: round2(assets - liabilities),
      },
    };
  }

  /**
   * Whether the user can realistically reach their active goals: monthly disposable
   * income (smoothed averages minus EMI + SIP commitments) vs. the saving each goal
   * needs to finish on time.
   */
  async goalFeasibility(userId: string): Promise<GoalFeasibilityResponse> {
    const now = new Date();
    const [emiSummary, portfolio, activeGoals, averages] = await Promise.all([
      emisService.summary(userId),
      investmentsService.summary(userId),
      goalsRepository.findActiveForUser(userId),
      this.monthlyAverages(userId, now, await this.resolveTimezone(userId)),
    ]);

    return this.buildFeasibility(
      now,
      averages,
      emiSummary.totalMonthlyCommitment,
      portfolio.totalMonthlySip,
      activeGoals,
    );
  }

  /** Income vs expense for each of the trailing `months` (oldest → newest). */
  async cashflow(userId: string, months: number): Promise<CashflowResponse> {
    const now = new Date();
    const [timezone, currency] = await Promise.all([
      this.resolveTimezone(userId),
      this.homeCurrency(userId),
    ]);
    const range = this.trailingMonths(now, months, timezone);

    const [expenseMonths, incomeMonths] = await Promise.all([
      expensesRepository.monthlyTotals(userId, range, timezone, currency),
      incomeRepository.monthlyTotals(userId, range, timezone, currency),
    ]);

    const expenseByKey = new Map(expenseMonths.map((r) => [`${r.year}-${r.month}`, r.total]));
    const incomeByKey = new Map(incomeMonths.map((r) => [`${r.year}-${r.month}`, r.total]));

    const series: CashflowPoint[] = [];
    const current = zonedParts(now, timezone);
    for (let i = months - 1; i >= 0; i -= 1) {
      // Step back in whole calendar months from the user's current one.
      const d = new Date(Date.UTC(current.year, current.month - i, 1));
      const year = d.getUTCFullYear();
      const month = d.getUTCMonth() + 1;
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
      from: range.from,
      to: range.to,
      series,
      totalIncome,
      totalExpense,
      net: round2(totalIncome - totalExpense),
    };
  }

  // --- Internals -------------------------------------------------------------

  /** The window covering the trailing `months` calendar months in `timezone`. */
  private trailingMonths(now: Date, months: number, timezone: string) {
    return {
      from: zonedMonthWindow(now, timezone, months - 1).from,
      to: zonedMonthWindow(now, timezone).to,
    };
  }

  /** The currency the user's own books are in — nothing else is added to them. */
  private async homeCurrency(userId: string): Promise<string> {
    const user = await usersService.findEntityById(userId);
    return user?.defaultCurrency ?? 'INR';
  }

  /** The user's IANA zone, so every calendar figure here is *their* month. */
  private async resolveTimezone(userId: string): Promise<string> {
    const user = await usersService.findEntityById(userId);
    return safeTimezone(user?.timezone);
  }

  /** Trailing-average monthly income and expense over `FEASIBILITY_BASIS_MONTHS`. */
  private async monthlyAverages(
    userId: string,
    now: Date,
    timezone: string,
  ): Promise<{ avgIncome: number; avgExpense: number; basisMonths: number }> {
    const basisMonths = FEASIBILITY_BASIS_MONTHS;
    const currency = await this.homeCurrency(userId);
    const range = this.trailingMonths(now, basisMonths, timezone);

    const [incomeMonths, expenseMonths] = await Promise.all([
      incomeRepository.monthlyTotals(userId, range, timezone, currency),
      expensesRepository.monthlyTotals(userId, range, timezone, currency),
    ]);

    const avgIncome = round2(incomeMonths.reduce((s, r) => s + r.total, 0) / basisMonths);
    const avgExpense = round2(expenseMonths.reduce((s, r) => s + r.total, 0) / basisMonths);
    return { avgIncome, avgExpense, basisMonths };
  }

  /** Pure assembly of the feasibility view from the fetched inputs. */
  private buildFeasibility(
    now: Date,
    averages: { avgIncome: number; avgExpense: number; basisMonths: number },
    emiCommitment: number,
    sipCommitment: number,
    activeGoals: GoalDocument[],
  ): GoalFeasibilityResponse {
    const disposableForGoals = round2(
      averages.avgIncome - averages.avgExpense - emiCommitment - sipCommitment,
    );

    const monthly: MonthlyCapacity = {
      avgIncome: averages.avgIncome,
      avgExpense: averages.avgExpense,
      emiCommitment,
      sipCommitment,
      disposableForGoals,
      basisMonths: averages.basisMonths,
    };

    const goals: GoalFeasibilityItem[] = activeGoals.map((goal) => {
      const metrics = computeGoalMetrics(
        goal.targetAmount,
        goal.currentAmount,
        now,
        goal.targetDate,
      );
      // No target date → no deadline pressure: nothing required, treated as on track.
      const required = metrics.requiredMonthlySaving ?? null;
      const onTrack = required === null ? true : disposableForGoals >= required;
      const shortfall = required === null ? 0 : Math.max(0, round2(required - disposableForGoals));

      return {
        id: goal._id.toString(),
        name: goal.name,
        targetAmount: goal.targetAmount,
        currentAmount: goal.currentAmount,
        remainingAmount: metrics.remainingAmount,
        targetDate: goal.targetDate,
        monthsRemaining: metrics.monthsRemaining,
        requiredMonthlySaving: required,
        onTrack,
        shortfall,
      };
    });

    const totalRequiredMonthlySaving = round2(
      goals.reduce((sum, g) => sum + (g.requiredMonthlySaving ?? 0), 0),
    );
    const onTrackCount = goals.filter((g) => g.onTrack).length;

    return {
      monthly,
      goals,
      totals: {
        activeGoals: goals.length,
        totalRequiredMonthlySaving,
        onTrackCount,
        allOnTrack: disposableForGoals >= totalRequiredMonthlySaving,
        monthlySurplus: round2(disposableForGoals - totalRequiredMonthlySaving),
      },
    };
  }
}

/** Shared singleton instance used across the app. */
export const analyticsService = new AnalyticsService();
