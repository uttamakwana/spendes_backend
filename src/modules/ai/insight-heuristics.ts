import type { InsightItem, SpendBrief } from './ai-response';

/**
 * A month's summary written by ordinary code from the same brief the model gets.
 *
 * As with the expense parser, this is the answer under `AI_PROVIDER=mock` and the
 * answer when a model call fails — the insights card is never empty and never an
 * error. It is also the baseline: if the model's version is not visibly better than
 * these templated sentences, the model is not worth what it costs on this route.
 */

/** The narrative half of an insights response — everything not derived from the brief. */
export interface InsightNarrative {
  headline: string;
  items: InsightItem[];
  suggestions: string[];
}

/** Categories below this share of the month are noise, not a story. */
const MATERIAL_SHARE_PCT = 12;

/** A month-on-month move smaller than this is not worth a sentence. */
const MATERIAL_CHANGE_PCT = 20;

/** Weekend spending above this share is a pattern worth naming. */
const WEEKEND_HEAVY_PCT = 45;

const money = (currency: string, amount: number): string =>
  `${currency} ${Math.round(amount).toLocaleString('en-US')}`;

const pct = (value: number): string => `${Math.abs(Math.round(value))}%`;

/** The biggest month-on-month mover among categories that actually matter. */
function biggestMover(brief: SpendBrief) {
  return brief.categories
    .filter((c) => c.changePct !== null && Math.abs(c.changePct) >= MATERIAL_CHANGE_PCT)
    .filter((c) => c.share >= MATERIAL_SHARE_PCT || c.amount >= brief.expense * 0.1)
    .sort((a, b) => Math.abs(b.changePct ?? 0) - Math.abs(a.changePct ?? 0))[0];
}

function headlineFor(brief: SpendBrief): string {
  if (brief.transactionCount === 0) {
    return `No spending recorded for ${brief.month} yet.`;
  }

  const spend = money(brief.currency, brief.expense);
  if (brief.expenseChangePct === null) {
    return `You spent ${spend} across ${brief.transactionCount} transactions in ${brief.month}.`;
  }

  const direction = brief.expenseChangePct >= 0 ? 'more' : 'less';
  if (Math.abs(brief.expenseChangePct) < 5) {
    return `You spent ${spend} in ${brief.month}, about level with last month.`;
  }
  return `You spent ${spend} in ${brief.month}, ${pct(brief.expenseChangePct)} ${direction} than last month.`;
}

function itemsFor(brief: SpendBrief): InsightItem[] {
  const items: InsightItem[] = [];

  const top = brief.categories[0];
  if (top && top.share >= MATERIAL_SHARE_PCT) {
    items.push({
      title: `${top.category} led your spending`,
      detail: `${money(brief.currency, top.amount)} went to ${top.category}, ${pct(top.share)} of everything you spent this month.`,
      sentiment: 'neutral',
      category: top.category,
    });
  }

  const mover = biggestMover(brief);
  if (mover && mover.category !== top?.category) {
    const rose = (mover.changePct ?? 0) > 0;
    items.push({
      title: `${mover.category} ${rose ? 'rose' : 'fell'} ${pct(mover.changePct ?? 0)}`,
      detail: `${mover.category} went from ${money(brief.currency, mover.previousAmount)} last month to ${money(brief.currency, mover.amount)} this month.`,
      sentiment: rose ? 'warning' : 'positive',
      category: mover.category,
    });
  }

  if (brief.weekend.weekendShare >= WEEKEND_HEAVY_PCT && brief.expense > 0) {
    items.push({
      title: 'Weekends carry your spending',
      detail: `${pct(brief.weekend.weekendShare)} of the month's spend landed on Saturdays and Sundays — ${money(brief.currency, brief.weekend.weekendAmount)} of ${money(brief.currency, brief.expense)}.`,
      sentiment: 'neutral',
    });
  }

  const strained = brief.budgets
    .filter((b) => b.status !== 'ok')
    .sort((a, b) => b.percentUsed - a.percentUsed)[0];
  if (strained) {
    const over = strained.status === 'exceeded';
    items.push({
      title: over ? `${strained.name} budget exceeded` : `${strained.name} budget is close`,
      detail: `You are at ${money(brief.currency, strained.spent)} against a ${money(brief.currency, strained.limit)} limit — ${pct(strained.percentUsed)} used.`,
      sentiment: 'warning',
    });
  }

  return items.slice(0, 4);
}

function suggestionsFor(brief: SpendBrief): string[] {
  const suggestions: string[] = [];

  const exceeded = brief.budgets.find((b) => b.status === 'exceeded');
  if (exceeded) {
    suggestions.push(
      `Your ${exceeded.name} budget is over by ${money(brief.currency, exceeded.spent - exceeded.limit)} — either raise the limit or hold off in that category until the month resets.`,
    );
  }

  const mover = biggestMover(brief);
  if (mover && (mover.changePct ?? 0) > 0) {
    suggestions.push(
      `${mover.category} is up ${pct(mover.changePct ?? 0)} on last month; a budget there would catch it earlier next time.`,
    );
  }

  if (brief.income > 0 && brief.savingsRate < 10) {
    suggestions.push(
      `You kept ${pct(brief.savingsRate)} of what you earned this month. Setting aside a fixed amount on payday is easier than saving what's left over.`,
    );
  }

  return suggestions.slice(0, 3);
}

/** The full templated narrative for a month. */
export function summarizeBriefHeuristically(brief: SpendBrief): InsightNarrative {
  if (brief.transactionCount === 0) {
    return { headline: headlineFor(brief), items: [], suggestions: [] };
  }
  return {
    headline: headlineFor(brief),
    items: itemsFor(brief),
    suggestions: suggestionsFor(brief),
  };
}
