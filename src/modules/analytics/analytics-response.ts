/** A single category's spend in the overview's top-categories list. */
export interface TopCategory {
  category: string;
  totalAmount: number;
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
