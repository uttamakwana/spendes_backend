import { z } from 'zod';
import { CategoryType } from '../../common/enums/category-type';
import { PaymentMethod } from '../../common/enums/payment-method';
import { safeTimezone, zonedParts, zonedTimeToUtc } from '../../common/utils/timezone';
import { createLogger } from '../../logger';
import { categoriesRepository } from '../categories/categories.repository';
import { usersService } from '../users/users.service';
import type { ExpenseDraft, ParseExpenseResponse } from './ai-response';
import {
  EXPENSE_PARSER_SYSTEM,
  expenseDraftSchema,
  expenseParserPrompt,
  UNKNOWN_CATEGORY,
} from './ai.prompts';
import {
  gapsIn,
  parseExpenseHeuristically,
  summarize,
  type CategoryChoice,
} from './expense-heuristics';
import { llmService, LlmService } from './llm.service';

/**
 * What the model is asked to return. The prompt's JSON Schema already constrains
 * this, but a schema the model was *asked* to follow is not the same thing as a
 * guarantee — this is the check that decides whether the object is usable, and a
 * failure here simply falls back to the heuristic draft.
 */
const modelDraftSchema = z.object({
  amount: z.number().nonnegative(),
  category: z.string(),
  date: z.string(),
  time: z.string(),
  paymentMethod: z.nativeEnum(PaymentMethod),
  merchant: z.string(),
  description: z.string(),
  confidence: z.number().min(0).max(1),
});

const round2 = (value: number): number => Math.round(value * 100) / 100;

const WEEKDAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

/** Empty string is the schema's "nothing here" value; normalize it away. */
const orUndefined = (value: string): string | undefined => {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed.slice(0, 255) : undefined;
};

/**
 * Turns "spent 250 on groceries yesterday" into a confirmable expense draft.
 *
 * Two things keep this honest. The model may only pick a category that already
 * exists for this user, so a draft can never name a bucket the rest of the app
 * cannot chart or budget. And nothing is written here — the draft goes back to the
 * client, the user confirms it, and it reaches the database through the same
 * `POST /expenses` contract as a hand-typed row. The model proposes; it never saves.
 */
export class ExpenseParserService {
  private readonly logger = createLogger('ExpenseParserService');

  constructor(private readonly llm: LlmService = llmService) {}

  async parse(userId: string, text: string): Promise<ParseExpenseResponse> {
    const now = new Date();
    const [user, categories] = await Promise.all([
      usersService.findEntityById(userId),
      categoriesRepository.findAllSorted({ type: CategoryType.Expense, isActive: true }),
    ]);

    const timezone = safeTimezone(user?.timezone);
    const currency = user?.defaultCurrency ?? 'INR';
    const choices: CategoryChoice[] = categories.map((c) => ({ name: c.name, slug: c.slug }));

    // Computed first, unconditionally: it is the mock provider's answer, the answer
    // when a model call fails, and the floor any model answer has to beat.
    const heuristic = parseExpenseHeuristically(text, {
      categories: choices,
      now,
      timezone,
      currency,
    });

    const today = zonedParts(now, timezone);
    const result = await this.llm.complete({
      system: EXPENSE_PARSER_SYSTEM,
      prompt: expenseParserPrompt({
        text,
        referenceDate: this.isoDate(today),
        referenceWeekday: this.weekdayOf(today),
        timezone,
        currency,
        categoryNames: choices.map((c) => c.name),
      }),
      schemaName: 'expense_draft',
      schema: expenseDraftSchema(choices.map((c) => c.name)),
      // Reading one sentence is not deep work; spending more here buys nothing.
      effort: 'low',
      fallback: heuristic,
    });

    const draft =
      result.source === 'model'
        ? this.toDraft(result.data, { heuristic, choices, now, timezone, currency })
        : heuristic;

    return { draft, source: result.source, model: result.model, input: text };
  }

  // --- Internals -------------------------------------------------------------

  /**
   * Maps a validated model object onto the draft contract, falling back field by
   * field to the heuristic reading. A model that returns a date it cannot justify
   * or a category that is not on the list loses only that field, not the draft.
   */
  private toDraft(
    data: unknown,
    ctx: {
      heuristic: ExpenseDraft;
      choices: CategoryChoice[];
      now: Date;
      timezone: string;
      currency: string;
    },
  ): ExpenseDraft {
    const parsed = modelDraftSchema.safeParse(data);
    if (!parsed.success) {
      this.logger.warn(
        { issues: parsed.error.issues },
        'Model draft failed validation — using the heuristic parse',
      );
      return ctx.heuristic;
    }

    const model = parsed.data;
    // Defence in depth: the schema enum should already have prevented this.
    const allowed = new Set(ctx.choices.map((c) => c.name));
    const category =
      model.category !== UNKNOWN_CATEGORY && allowed.has(model.category)
        ? model.category
        : ctx.heuristic.category;

    const draft: ExpenseDraft = {
      amount: model.amount > 0 ? round2(model.amount) : ctx.heuristic.amount,
      currency: ctx.currency,
      category,
      description: orUndefined(model.description) ?? ctx.heuristic.description,
      merchant: orUndefined(model.merchant),
      paymentMethod: model.paymentMethod,
      spentAt: this.resolveSpentAt(model.date, model.time, ctx).toISOString(),
      confidence: round2(model.confidence),
      missing: [],
      summary: '',
    };

    draft.missing = gapsIn(draft);
    draft.summary = summarize(draft, ctx.now, ctx.timezone);
    return draft;
  }

  /**
   * Builds the instant from the model's calendar date and optional time, in the
   * user's zone. A date that will not parse, or one in the future, is not trusted —
   * the heuristic reading stands instead. A date with no time lands at noon so no
   * downstream hour shift can move it into the wrong day.
   */
  private resolveSpentAt(
    date: string,
    time: string,
    ctx: { heuristic: ExpenseDraft; now: Date; timezone: string },
  ): Date {
    const day = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!day) {
      return new Date(ctx.heuristic.spentAt);
    }

    const clock = time.match(/^(\d{1,2}):(\d{2})$/);
    const hour = clock ? Number.parseInt(clock[1] as string, 10) : 12;
    const minute = clock ? Number.parseInt(clock[2] as string, 10) : 0;
    if (hour > 23 || minute > 59) {
      return new Date(ctx.heuristic.spentAt);
    }

    const resolved = zonedTimeToUtc(
      ctx.timezone,
      Number.parseInt(day[1] as string, 10),
      Number.parseInt(day[2] as string, 10) - 1,
      Number.parseInt(day[3] as string, 10),
      hour,
      minute,
    );

    if (Number.isNaN(resolved.getTime()) || resolved.getTime() > ctx.now.getTime()) {
      return new Date(ctx.heuristic.spentAt);
    }
    return resolved;
  }

  private isoDate(parts: { year: number; month: number; day: number }): string {
    const month = String(parts.month + 1).padStart(2, '0');
    const day = String(parts.day).padStart(2, '0');
    return `${parts.year}-${month}-${day}`;
  }

  private weekdayOf(parts: { year: number; month: number; day: number }): string {
    const index = new Date(Date.UTC(parts.year, parts.month, parts.day)).getUTCDay();
    return WEEKDAY_NAMES[index] as string;
  }
}

/** Shared singleton instance used across the app. */
export const expenseParserService = new ExpenseParserService();
