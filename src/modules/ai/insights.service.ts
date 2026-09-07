import { createHash } from 'node:crypto';
import { z } from 'zod';
import { BadRequestException } from '../../common/errors/http-exception';
import {
  safeTimezone,
  zonedDayWindow,
  zonedMonthWindow,
  zonedParts,
  type Window,
} from '../../common/utils/timezone';
import { createLogger } from '../../logger';
import { budgetsService } from '../budgets/budgets.service';
import { expensesRepository } from '../expenses/expenses.repository';
import { expensesService } from '../expenses/expenses.service';
import { incomeService } from '../income/income.service';
import { usersService } from '../users/users.service';
import type {
  BudgetBrief,
  CategoryBrief,
  InsightItem,
  SpendBrief,
  SpendingInsightsResponse,
} from './ai-response';
import { INSIGHTS_SCHEMA, INSIGHTS_SYSTEM, insightsPrompt } from './ai.prompts';
import { summarizeBriefHeuristically, type InsightNarrative } from './insight-heuristics';
import { insightsRepository, InsightsRepository } from './insights.repository';
import { llmService, LlmService } from './llm.service';

/** What the model is asked to return; a failure here falls back to the templated narrative. */
const narrativeSchema = z.object({
  headline: z.string().trim().min(1).max(400),
  items: z
    .array(
      z.object({
        title: z.string().trim().min(1).max(120),
        detail: z.string().trim().min(1).max(600),
        sentiment: z.enum(['positive', 'neutral', 'warning']),
        category: z.string().trim().max(60),
      }),
    )
    .max(6),
  suggestions: z.array(z.string().trim().min(1).max(400)).max(5),
});

const round2 = (value: number): number => Math.round(value * 100) / 100;

/** How many categories the model is shown. Beyond this it is reading noise. */
const BRIEF_CATEGORY_LIMIT = 8;

/**
 * The AI monthly summary: the app's own analytics, turned into something a person
 * would actually say about their month.
 *
 * The shape of this feature is "structured data in, prose out", and the ordering
 * matters. The figures are computed first, by the same services that power the
 * dashboard; only then is a model asked to narrate them, and it is told to state no
 * number that is not in front of it. The brief goes back to the client alongside the
 * narrative, so every sentence can be checked against the data it came from.
 *
 * Generations are stored per (user, month) and reused until the month's figures
 * actually move — a paragraph that costs money to write should not be rewritten
 * because someone opened the dashboard twice.
 */
export class InsightsService {
  private readonly logger = createLogger('InsightsService');

  constructor(
    private readonly repository: InsightsRepository = insightsRepository,
    private readonly llm: LlmService = llmService,
  ) {}

  /**
   * The summary for one month (the current one unless `monthKey` names another).
   * Served from storage when the figures behind it have not changed; `refresh`
   * forces a regeneration.
   */
  async monthly(
    userId: string,
    options: { monthKey?: string; refresh?: boolean } = {},
  ): Promise<SpendingInsightsResponse> {
    const now = new Date();
    const user = await usersService.findEntityById(userId);
    const timezone = safeTimezone(user?.timezone);
    const currency = user?.defaultCurrency ?? 'INR';

    const period = this.resolvePeriod(options.monthKey, now, timezone);
    const brief = await this.buildBrief(userId, period, currency, timezone);
    const fingerprint = this.fingerprint(brief);

    if (!options.refresh) {
      const stored = await this.repository.findForPeriod(userId, period.key);
      if (stored && stored.fingerprint === fingerprint) {
        return this.toResponse(period, currency, brief, stored, true);
      }
    }

    const narrative = await this.generate(brief);

    const saved = await this.repository.saveForPeriod(userId, period.key, {
      periodStart: period.from,
      periodEnd: period.to,
      currency,
      headline: narrative.headline,
      items: narrative.items,
      suggestions: narrative.suggestions,
      brief,
      fingerprint,
      source: narrative.source,
      model: narrative.model,
      generatedAt: new Date(),
    });

    return this.toResponse(period, currency, brief, saved, false);
  }

  // --- Generation ------------------------------------------------------------

  /** Asks the model to narrate the brief, falling back to the templated narrative. */
  private async generate(
    brief: SpendBrief,
  ): Promise<InsightNarrative & { source: 'model' | 'heuristic'; model: string }> {
    const fallback = summarizeBriefHeuristically(brief);

    // Nothing to narrate, and nothing worth paying a model to say so.
    if (brief.transactionCount === 0) {
      return { ...fallback, source: 'heuristic', model: this.llm.model };
    }

    const result = await this.llm.complete({
      system: INSIGHTS_SYSTEM,
      prompt: insightsPrompt(brief),
      schemaName: 'spending_insights',
      schema: INSIGHTS_SCHEMA,
      // Finding what actually matters in a month of spending is the judgement this
      // feature is paying for; low effort here produces the obvious observation.
      effort: 'medium',
      fallback,
    });

    if (result.source !== 'model') {
      return { ...fallback, source: 'heuristic', model: result.model };
    }

    const parsed = narrativeSchema.safeParse(result.data);
    if (!parsed.success) {
      this.logger.warn(
        { issues: parsed.error.issues },
        'Model narrative failed validation — using the templated summary',
      );
      return { ...fallback, source: 'heuristic', model: result.model };
    }

    const items: InsightItem[] = parsed.data.items.map((item) => ({
      title: item.title,
      detail: item.detail,
      sentiment: item.sentiment,
      // Empty string is the schema's "no category"; drop it rather than store it.
      ...(item.category.length > 0 ? { category: item.category } : {}),
    }));

    return {
      headline: parsed.data.headline,
      items,
      suggestions: parsed.data.suggestions,
      source: 'model',
      model: result.model,
    };
  }

  // --- The brief -------------------------------------------------------------

  /**
   * Assembles the month's figures from the modules that already own them. Nothing is
   * recomputed here that the dashboard does not already compute — the point of this
   * method is selection and shaping, so the model sees a small, comparable picture
   * rather than a dump of rows.
   */
  private async buildBrief(
    userId: string,
    period: ResolvedPeriod,
    currency: string,
    timezone: string,
  ): Promise<SpendBrief> {
    const range = { from: period.from, to: period.to };
    const previous = period.previous;

    const [expense, previousExpense, income, weekend, largest, budgets] = await Promise.all([
      expensesService.summary(userId, range),
      expensesService.summary(userId, { from: previous.from, to: previous.to }),
      incomeService.summary(userId, range),
      expensesRepository.weekendSplit(userId, range, timezone, currency),
      expensesRepository.find(
        { userId, currency, spentAt: { $gte: range.from, $lte: range.to } },
        undefined,
        {
          sort: { amount: -1 },
          limit: 1,
        },
      ),
      // Budgets track the *current* period, so they only describe the current month.
      period.isCurrentMonth ? this.activeBudgets(userId) : Promise.resolve([]),
    ]);

    const previousByCategory = new Map(
      previousExpense.byCategory.map((c) => [c.category, c.totalAmount]),
    );

    const total = expense.totalAmount;
    const categories: CategoryBrief[] = expense.byCategory
      .slice(0, BRIEF_CATEGORY_LIMIT)
      .map((c) => {
        const before = previousByCategory.get(c.category) ?? 0;
        return {
          category: c.category,
          amount: round2(c.totalAmount),
          share: total > 0 ? round2((c.totalAmount / total) * 100) : 0,
          previousAmount: round2(before),
          changePct: before > 0 ? round2(((c.totalAmount - before) / before) * 100) : null,
        };
      });

    const weekendTotal = weekend.weekendAmount + weekend.weekdayAmount;
    const biggest = largest[0];

    return {
      month: period.label,
      currency,
      income: round2(income.totalAmount),
      expense: round2(total),
      cashOutflow: round2(expense.cashOutflow),
      net: round2(income.totalAmount - total),
      savingsRate:
        income.totalAmount > 0
          ? round2(((income.totalAmount - total) / income.totalAmount) * 100)
          : 0,
      transactionCount: expense.count,
      previousExpense: round2(previousExpense.totalAmount),
      expenseChangePct:
        previousExpense.totalAmount > 0
          ? round2(((total - previousExpense.totalAmount) / previousExpense.totalAmount) * 100)
          : null,
      categories,
      weekend: {
        weekendAmount: round2(weekend.weekendAmount),
        weekdayAmount: round2(weekend.weekdayAmount),
        weekendShare: weekendTotal > 0 ? round2((weekend.weekendAmount / weekendTotal) * 100) : 0,
      },
      budgets,
      largestExpense: biggest
        ? {
            amount: round2(biggest.amount),
            category: biggest.category,
            ...(biggest.description ? { description: biggest.description } : {}),
            date: biggest.spentAt.toISOString(),
          }
        : null,
    };
  }

  /** Active budgets and how they are tracking, flattened for the brief. */
  private async activeBudgets(userId: string): Promise<BudgetBrief[]> {
    const page = await budgetsService.findAll(userId, {
      page: 1,
      limit: 50,
      sortOrder: 'desc',
      activeOnly: true,
    });

    return page.items.map((budget) => ({
      name: budget.name ?? budget.category ?? 'Overall',
      limit: budget.amount,
      spent: budget.spent,
      percentUsed: budget.percentUsed,
      status: budget.status,
    }));
  }

  // --- Periods and caching ---------------------------------------------------

  /**
   * The month to summarize, plus the month before it for comparison. `monthKey` is
   * `YYYY-MM` in the user's own zone; omitted, it means the month they are in now.
   */
  private resolvePeriod(monthKey: string | undefined, now: Date, timezone: string): ResolvedPeriod {
    const current = zonedMonthWindow(now, timezone);
    const today = zonedParts(now, timezone);

    if (!monthKey) {
      return this.describePeriod(today.year, today.month, current, timezone, true);
    }

    const match = monthKey.match(/^(\d{4})-(\d{2})$/);
    if (!match) {
      throw new BadRequestException('month must be in YYYY-MM format');
    }
    const year = Number.parseInt(match[1] as string, 10);
    const month = Number.parseInt(match[2] as string, 10) - 1;
    if (month < 0 || month > 11) {
      throw new BadRequestException('month must be between 01 and 12');
    }

    const window = this.monthWindow(year, month, timezone);
    if (window.from.getTime() > now.getTime()) {
      throw new BadRequestException('That month has not started yet');
    }

    const isCurrent = year === today.year && month === today.month;
    return this.describePeriod(year, month, window, timezone, isCurrent);
  }

  /** The instant window covering a whole calendar month in `timezone`. */
  private monthWindow(year: number, month: number, timezone: string): Window {
    // Day 0 of the next month is the last day of this one.
    const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    return zonedDayWindow(timezone, { year, month, day: 1 }, { year, month, day: lastDay });
  }

  private describePeriod(
    year: number,
    month: number,
    window: Window,
    timezone: string,
    isCurrentMonth: boolean,
  ): ResolvedPeriod {
    const previousStart = new Date(Date.UTC(year, month - 1, 1));
    return {
      key: `${year}-${String(month + 1).padStart(2, '0')}`,
      from: window.from,
      to: window.to,
      label: new Intl.DateTimeFormat('en-US', {
        month: 'long',
        year: 'numeric',
        timeZone: 'UTC',
      }).format(new Date(Date.UTC(year, month, 15))),
      isCurrentMonth,
      previous: this.monthWindow(
        previousStart.getUTCFullYear(),
        previousStart.getUTCMonth(),
        timezone,
      ),
    };
  }

  /**
   * A stable hash of the figures. Two briefs that hash the same describe the same
   * month, so the stored narrative still holds; a new expense changes the hash and
   * the summary is rewritten on the next read.
   */
  private fingerprint(brief: SpendBrief): string {
    return createHash('sha1').update(JSON.stringify(brief)).digest('hex');
  }

  private toResponse(
    period: ResolvedPeriod,
    currency: string,
    brief: SpendBrief,
    stored: {
      headline: string;
      items: InsightItem[];
      suggestions: string[];
      source: 'model' | 'heuristic';
      model: string;
      generatedAt: Date;
    },
    cached: boolean,
  ): SpendingInsightsResponse {
    return {
      period: { key: period.key, from: period.from, to: period.to, label: period.label },
      currency,
      headline: stored.headline,
      items: stored.items,
      suggestions: stored.suggestions,
      brief,
      generatedAt: stored.generatedAt,
      source: stored.source,
      model: stored.model,
      cached,
    };
  }
}

/** A resolved month: its window, its label, and the month before it. */
interface ResolvedPeriod {
  key: string;
  from: Date;
  to: Date;
  label: string;
  isCurrentMonth: boolean;
  previous: Window;
}

/** Shared singleton instance used across the app. */
export const insightsService = new InsightsService();
