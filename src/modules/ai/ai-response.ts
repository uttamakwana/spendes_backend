import type { PaymentMethod } from '../../common/enums/payment-method';
import type { AiSource } from './ai.types';

// ── Natural-language expense entry ──────────────────────────────────────────

/** A field the draft could not fill — the client should focus it for the user. */
export type DraftGap = 'amount' | 'category';

/**
 * A *proposed* expense, not a saved one. Parsing "spent 250 on groceries yesterday"
 * produces this; the user confirms it and the client posts it to `POST /expenses`
 * like any other expense. Nothing is written on the user's behalf from a sentence —
 * the model proposes, the user disposes, and the existing validated create path
 * stays the only way an expense reaches the database.
 */
export interface ExpenseDraft {
  /** Major units (rupees, not paise). Null when the text named no amount. */
  amount: number | null;
  currency: string;
  /** Always one of the user's real categories, or null — never invented. */
  category: string | null;
  description?: string;
  merchant?: string;
  paymentMethod: PaymentMethod;
  /** Resolved instant, ISO-8601. Defaults to now when the text gave no date. */
  spentAt: string;
  notes?: string;
  /** The parser's own confidence, 0–1. Low values should prompt a closer look. */
  confidence: number;
  /** Required fields still empty — the client focuses these instead of saving. */
  missing: DraftGap[];
  /** One-line restatement for the confirm sheet, e.g. "₹250 · Groceries · yesterday". */
  summary: string;
}

/** Result of `POST /ai/expenses/parse`. */
export interface ParseExpenseResponse {
  draft: ExpenseDraft;
  /** Whether a model produced this or the offline heuristic did. */
  source: AiSource;
  model: string;
  /** Echoed so the client can show what was understood from what was said. */
  input: string;
}

// ── Monthly spending insights ───────────────────────────────────────────────

/** Which way an observation cuts, so the UI can tint it without parsing prose. */
export type InsightSentiment = 'positive' | 'neutral' | 'warning';

export interface InsightItem {
  title: string;
  detail: string;
  sentiment: InsightSentiment;
  /** The category it concerns, when it concerns one. */
  category?: string;
}

/** One category's month, next to the same category's previous month. */
export interface CategoryBrief {
  category: string;
  amount: number;
  /** Share of the month's total spend, 0–100. */
  share: number;
  previousAmount: number;
  /** Percent change vs the previous month; null when there was no previous spend. */
  changePct: number | null;
}

/** A budget's standing at the time the insight was written. */
export interface BudgetBrief {
  name: string;
  limit: number;
  spent: number;
  percentUsed: number;
  status: string;
}

/**
 * The month's figures, exactly as handed to the model — and returned to the client
 * alongside the narrative. Publishing the input next to the output is what keeps
 * the feature honest: every claim in `headline` or `items` can be checked against
 * the numbers it was written from, by a reader or by a test.
 */
export interface SpendBrief {
  /** Human label, e.g. "September 2026". */
  month: string;
  currency: string;
  income: number;
  expense: number;
  cashOutflow: number;
  net: number;
  savingsRate: number;
  transactionCount: number;
  previousExpense: number;
  /** Percent change in total spend vs the previous month; null with no prior month. */
  expenseChangePct: number | null;
  categories: CategoryBrief[];
  weekend: {
    weekendAmount: number;
    weekdayAmount: number;
    /** Weekend share of total spend, 0–100. */
    weekendShare: number;
  };
  budgets: BudgetBrief[];
  largestExpense: {
    amount: number;
    category: string;
    description?: string;
    date: string;
  } | null;
}

/** Result of `GET /ai/insights`. */
export interface SpendingInsightsResponse {
  period: {
    /** `YYYY-MM` in the user's zone — the cache key and the client's query param. */
    key: string;
    from: Date;
    to: Date;
    label: string;
  };
  currency: string;
  /** One sentence: the month in a line. */
  headline: string;
  items: InsightItem[];
  /** Concrete, checkable next actions. Empty when the month gives no honest advice. */
  suggestions: string[];
  /** The figures the narrative was written from. */
  brief: SpendBrief;
  generatedAt: Date;
  source: AiSource;
  model: string;
  /** True when served from a stored generation rather than freshly written. */
  cached: boolean;
}

/** Result of `GET /ai/status` — what the client can offer before it offers it. */
export interface AiStatusResponse {
  /** False when running on the mock provider: features work, but answers are heuristic. */
  modelBacked: boolean;
  model: string;
  features: {
    naturalLanguageEntry: boolean;
    spendingInsights: boolean;
  };
}
