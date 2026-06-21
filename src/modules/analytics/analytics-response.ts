/** A single category's spend in the overview's top-categories list. */
export interface TopCategory {
  category: string;
  totalAmount: number;
}

/**
 * The recurring monthly money picture used to judge goal feasibility. Income and
 * expense are trailing averages (smoothed over recent months); EMI and SIP are the
 * standing commitments. `disposableForGoals` is what's left after living costs and
 * everything already committed — the cash actually available to fund goals.
 */
export interface MonthlyCapacity {
  avgIncome: number;
  avgExpense: number;
  emiCommitment: number;
  sipCommitment: number;
  disposableForGoals: number;
  /** How many trailing months the averages are computed over. */
  basisMonths: number;
}

/** Feasibility of a single goal given the user's monthly capacity. */
export interface GoalFeasibilityItem {
  id: string;
  name: string;
  targetAmount: number;
  currentAmount: number;
  remainingAmount: number;
  targetDate?: Date;
  monthsRemaining?: number;
  /** Monthly saving needed to hit the target on time (null when no target date is set). */
  requiredMonthlySaving: number | null;
  /** Whether disposable income alone covers this goal's required pace. */
  onTrack: boolean;
  /** `max(0, required − disposable)` — the monthly gap, 0 when on track. */
  shortfall: number;
}

/**
 * Result of `GET /analytics/goals`: whether the user can realistically reach their
 * active goals. Per-goal `onTrack` is judged in isolation (does disposable cover this
 * goal's pace); the `totals` also report the aggregate — whether disposable covers
 * every dated goal's required saving at once.
 */
export interface GoalFeasibilityResponse {
  monthly: MonthlyCapacity;
  goals: GoalFeasibilityItem[];
  totals: {
    activeGoals: number;
    /** Sum of required monthly saving across goals that have a target date. */
    totalRequiredMonthlySaving: number;
    onTrackCount: number;
    allOnTrack: boolean;
    /** `disposableForGoals − totalRequiredMonthlySaving` (negative = collective shortfall). */
    monthlySurplus: number;
  };
}

/**
 * The home-dashboard snapshot: this month's income vs spend and savings rate, the
 * top spending categories, the recurring commitment load, the investment portfolio,
 * and a (partial) net-worth line. Net worth covers what the app knows — investments
 * + goal savings as assets, outstanding loan balances as liabilities — and excludes
 * bank cash (not tracked yet).
 */
export interface AnalyticsOverviewResponse {
  period: { from: Date; to: Date };
  income: number;
  expense: number;
  /**
   * Actual cash that left the user's pocket this period — personal spend plus the
   * user's payer share of splits (what they fronted), even the part others owe back.
   * Always ≥ `expense` (consumption/your share); the gap is money you're owed.
   */
  cashOutflow: number;
  net: number;
  savingsRate: number;
  topCategories: TopCategory[];
  commitments: {
    totalMonthlyCommitment: number;
    dueThisMonthCount: number;
    dueThisMonthTotal: number;
  };
  portfolio: {
    totalInvested: number;
    totalCurrentValue: number;
    totalGainLoss: number;
    gainLossPct: number;
    /** Combined monthly-equivalent of active SIP plans. */
    totalMonthlySip: number;
  };
  /** What friends owe you and what you owe them, derived from direct splits. */
  balances: {
    youAreOwed: number;
    youOwe: number;
    net: number;
  };
  /** A compact goal-feasibility readout (full detail at `GET /analytics/goals`). */
  goals: {
    activeCount: number;
    onTrackCount: number;
    allOnTrack: boolean;
    totalRequiredMonthlySaving: number;
    disposableForGoals: number;
  };
  netWorth: {
    assets: number;
    liabilities: number;
    net: number;
  };
}

/** One month in the cash-flow trend. */
export interface CashflowPoint {
  year: number;
  month: number;
  label: string;
  income: number;
  expense: number;
  net: number;
}

/** Result of `GET /analytics/cashflow`: income vs expense across the trailing months. */
export interface CashflowResponse {
  months: number;
  from: Date;
  to: Date;
  series: CashflowPoint[];
  totalIncome: number;
  totalExpense: number;
  net: number;
}
