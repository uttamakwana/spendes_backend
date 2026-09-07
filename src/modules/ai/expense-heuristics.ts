import { PaymentMethod } from '../../common/enums/payment-method';
import { zonedParts, zonedTimeToUtc } from '../../common/utils/timezone';
import type { DraftGap, ExpenseDraft } from './ai-response';

/**
 * Ordinary-code parsing of "spent 250 on groceries yesterday".
 *
 * This is deliberately not a stub. It is the answer served when `AI_PROVIDER=mock`,
 * and the answer served when a real model call refuses, times out or comes back
 * malformed — so natural-language entry degrades to something usable instead of an
 * error. It is also the floor the model has to beat, which is the only honest way
 * to judge whether the model is earning its cost.
 *
 * Everything here is pure: same text, same context, same draft.
 */

/** A category the parser is allowed to choose. Slug is the stable identity. */
export interface CategoryChoice {
  name: string;
  slug: string;
}

export interface ParseContext {
  categories: CategoryChoice[];
  /** "Now" — the reference point every relative date resolves against. */
  now: Date;
  timezone: string;
  currency: string;
}

/** Words that point at a category but do not appear in its name, keyed by slug. */
const CATEGORY_HINTS: Record<string, string[]> = {
  'food-dining': [
    'restaurant',
    'dinner',
    'lunch',
    'breakfast',
    'cafe',
    'coffee',
    'pizza',
    'swiggy',
    'zomato',
    'takeaway',
    'brunch',
    'snacks',
    'chai',
  ],
  groceries: [
    'grocery',
    'groceries',
    'supermarket',
    'vegetables',
    'veggies',
    'milk',
    'bigbasket',
    'blinkit',
    'zepto',
    'dmart',
    'kirana',
  ],
  transport: ['uber', 'ola', 'cab', 'taxi', 'auto', 'rickshaw', 'metro', 'bus', 'train', 'rapido'],
  fuel: ['petrol', 'diesel', 'fuel', 'cng'],
  shopping: ['amazon', 'flipkart', 'myntra', 'clothes', 'shirt', 'shoes', 'jeans', 'dress', 'mall'],
  'bills-utilities': ['electricity', 'water bill', 'gas bill', 'utility', 'utilities', 'bill'],
  'rent-housing': ['rent', 'landlord', 'maintenance', 'society'],
  'mobile-internet': [
    'recharge',
    'mobile',
    'internet',
    'broadband',
    'wifi',
    'airtel',
    'jio',
    'data pack',
  ],
  entertainment: ['movie', 'cinema', 'concert', 'bowling', 'pvr'],
  'health-medical': ['doctor', 'medicine', 'pharmacy', 'medical', 'hospital', 'clinic', 'chemist'],
  fitness: ['gym', 'yoga', 'workout', 'trainer', 'fitness'],
  education: ['course', 'tuition', 'books', 'college', 'udemy', 'coaching'],
  travel: ['flight', 'hotel', 'trip', 'airbnb', 'vacation', 'holiday'],
  'personal-care': ['salon', 'haircut', 'spa', 'grooming', 'barber', 'parlour'],
  subscriptions: ['subscription', 'netflix', 'spotify', 'prime', 'icloud', 'hotstar'],
  insurance: ['insurance', 'premium', 'policy'],
  investments: ['sip', 'mutual fund', 'stocks', 'shares', 'invested'],
  'gifts-donations': ['gift', 'donation', 'charity', 'donated'],
  'family-kids': ['kids', 'children', 'school', 'toys', 'diapers'],
  pets: ['pet', 'dog', 'cat', 'vet'],
  electronics: ['laptop', 'phone', 'headphones', 'charger', 'gadget', 'monitor', 'keyboard'],
  'home-furniture': ['furniture', 'sofa', 'mattress', 'ikea', 'curtains'],
  taxes: ['tax', 'gst'],
  'loan-emi': ['emi', 'loan', 'instalment', 'installment'],
};

/** Payment-rail keywords, most specific first. */
const METHOD_HINTS: [PaymentMethod, string[]][] = [
  [
    PaymentMethod.Upi,
    ['upi', 'gpay', 'google pay', 'phonepe', 'phone pe', 'paytm', 'bhim', 'scanned'],
  ],
  [PaymentMethod.Card, ['card', 'credit', 'debit', 'visa', 'mastercard', 'amex', 'swiped']],
  [
    PaymentMethod.BankTransfer,
    ['neft', 'imps', 'rtgs', 'bank transfer', 'net banking', 'netbanking'],
  ],
  [PaymentMethod.Wallet, ['wallet', 'amazon pay balance']],
  [PaymentMethod.Cash, ['cash', 'notes']],
];

/** Suffix multipliers: "1.5k" is 1500, "2 lakh" is 200000. */
const MULTIPLIERS: [RegExp, number][] = [
  [/^(k|thousand)$/i, 1_000],
  [/^(lakh|lakhs|lac|lacs)$/i, 100_000],
  [/^(cr|crore|crores)$/i, 10_000_000],
  [/^(m|mn|million)$/i, 1_000_000],
];

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

const round2 = (value: number): number => Math.round(value * 100) / 100;

/**
 * Removes clock times and numeric dates so the amount scanner cannot mistake "7pm"
 * or "12/03" for money. The date and time readers run against the raw string, so
 * nothing is lost by blanking them here.
 */
function withoutTemporalNumbers(text: string): string {
  return text
    .replace(/\b\d{1,2}\s*[:.]\s*\d{2}\s*(am|pm)?\b/gi, ' ')
    .replace(/\b\d{1,2}\s*(am|pm)\b/gi, ' ')
    .replace(/\b\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?\b/g, ' ')
    .replace(/\b\d+\s*(days?|weeks?|months?|hours?|mins?|minutes?)\s+ago\b/gi, ' ');
}

/** Applies a "k" / "lakh" / "crore" suffix to a bare figure. */
function applyMultiplier(value: number, suffix?: string): number {
  if (!suffix) return value;
  const found = MULTIPLIERS.find(([pattern]) => pattern.test(suffix));
  return found ? value * found[1] : value;
}

/**
 * The amount, in major units. Prefers a figure attached to a currency marker
 * ("₹250", "250 rupees") over a bare number, because a sentence often holds several
 * numbers and only one of them is the price.
 */
export function extractAmount(text: string): number | null {
  const cleaned = withoutTemporalNumbers(text);
  const number = String.raw`(\d[\d,]*(?:\.\d{1,2})?)`;
  const scale = String.raw`(k|thousand|lakhs?|lacs?|crores?|cr|m|mn|million)?`;

  const patterns = [
    // Marker before the figure: ₹250, rs 250, $12.50
    new RegExp(String.raw`(?:₹|rs\.?|inr|\$|usd|€|eur|£|gbp)\s*${number}\s*${scale}`, 'i'),
    // Marker after the figure: 250 rupees, 250 bucks, 12 dollars
    new RegExp(
      String.raw`${number}\s*${scale}\s*(?:rs\.?|rupees?|bucks?|dollars?|euros?|pounds?)\b`,
      'i',
    ),
    // A scaled bare figure: "1.5k", "2 lakh"
    new RegExp(String.raw`\b${number}\s*(k|thousand|lakhs?|lacs?|crores?|cr|m|mn|million)\b`, 'i'),
    // Last resort: the first bare figure left standing.
    new RegExp(String.raw`\b${number}\b`),
  ];

  for (const pattern of patterns) {
    const match = cleaned.match(pattern);
    if (!match?.[1]) continue;
    const value = Number.parseFloat(match[1].replace(/,/g, ''));
    if (!Number.isFinite(value) || value <= 0) continue;
    return round2(applyMultiplier(value, match[2]));
  }
  return null;
}

/** The best-matching category, or null when nothing in the text points at one. */
export function extractCategory(text: string, categories: CategoryChoice[]): string | null {
  const haystack = ` ${text.toLowerCase()} `;

  let best: { name: string; score: number } | null = null;
  for (const category of categories) {
    // A category's own words, minus the connectives in names like "Food & Dining".
    const own = category.name
      .toLowerCase()
      .split(/[^a-z]+/)
      .filter((word) => word.length > 3 && word !== 'other');

    for (const term of [...(CATEGORY_HINTS[category.slug] ?? []), ...own]) {
      if (!haystack.includes(` ${term}`)) continue;
      // Longer matches win, so "google pay" cannot lose to "pay".
      if (!best || term.length > best.score) {
        best = { name: category.name, score: term.length };
      }
    }
  }
  return best?.name ?? null;
}

/** The payment rail named in the text, defaulting to `Other`. */
export function extractPaymentMethod(text: string): PaymentMethod {
  const haystack = ` ${text.toLowerCase()} `;
  for (const [method, hints] of METHOD_HINTS) {
    if (hints.some((hint) => haystack.includes(` ${hint}`))) {
      return method;
    }
  }
  return PaymentMethod.Other;
}

/** A calendar date in the user's zone, `daysBack` days before today. */
function dayOffsetFrom(now: Date, timezone: string, daysBack: number) {
  const today = zonedParts(now, timezone);
  const shifted = new Date(Date.UTC(today.year, today.month, today.day - daysBack));
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth(),
    day: shifted.getUTCDate(),
  };
}

/** An explicit clock time, or the conventional hour for "last night" / "this morning". */
function extractTimeOfDay(lower: string): { hour: number; minute: number } | null {
  const clock = lower.match(/\b(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)\b/);
  if (clock?.[1]) {
    let hour = Number.parseInt(clock[1], 10) % 12;
    if (clock[3] === 'pm') hour += 12;
    return { hour, minute: clock[2] ? Number.parseInt(clock[2], 10) : 0 };
  }

  const military = lower.match(/\b(\d{1,2}):(\d{2})\b/);
  if (military?.[1] && military[2]) {
    const hour = Number.parseInt(military[1], 10);
    const minute = Number.parseInt(military[2], 10);
    if (hour < 24 && minute < 60) return { hour, minute };
  }

  if (/\b(last night|tonight)\b/.test(lower)) return { hour: 21, minute: 0 };
  if (/\bthis morning\b/.test(lower)) return { hour: 9, minute: 0 };
  if (/\bthis afternoon\b/.test(lower)) return { hour: 15, minute: 0 };
  if (/\bthis evening\b/.test(lower)) return { hour: 19, minute: 0 };
  return null;
}

/**
 * When the money moved. Understands the relative language people actually use
 * ("yesterday", "last night", "3 days ago", "last friday") and resolves it against
 * the user's own calendar. Falls back to now.
 *
 * A past date with no stated time lands at noon rather than midnight, so an
 * off-by-one hour anywhere downstream cannot push it into the wrong day.
 */
export function extractSpentAt(text: string, now: Date, timezone: string): Date {
  const lower = text.toLowerCase();

  let daysBack: number | null = null;
  if (/\bday before yesterday\b/.test(lower)) {
    daysBack = 2;
  } else if (/\b(yesterday|last night|yday)\b/.test(lower)) {
    daysBack = 1;
  } else if (/\b(today|tonight|just now|this morning|this afternoon|this evening)\b/.test(lower)) {
    daysBack = 0;
  } else {
    const ago = lower.match(/\b(\d{1,3})\s*(days?|weeks?)\s+ago\b/);
    if (ago?.[1]) {
      const count = Number.parseInt(ago[1], 10);
      daysBack = ago[2]?.startsWith('week') ? count * 7 : count;
    } else {
      const named = lower.match(
        /\b(?:last\s+|on\s+)?(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/,
      );
      if (named?.[1]) {
        const target = WEEKDAYS.indexOf(named[1]);
        const today = zonedParts(now, timezone);
        const current = new Date(Date.UTC(today.year, today.month, today.day)).getUTCDay();
        // The most recent occurrence; naming today's weekday means a week ago.
        daysBack = (current - target + 7) % 7 || 7;
      }
    }
  }

  if (daysBack === null) {
    return now;
  }

  const time = extractTimeOfDay(lower);
  if (daysBack === 0 && !time) {
    // "today" with no stated time is simply now.
    return now;
  }

  const date = dayOffsetFrom(now, timezone, daysBack);
  return zonedTimeToUtc(
    timezone,
    date.year,
    date.month,
    date.day,
    time?.hour ?? 12,
    time?.minute ?? 0,
  );
}

/** A short label for the expense: the sentence minus the bookkeeping words. */
export function extractDescription(text: string): string | undefined {
  const cleaned = text
    .replace(/(?:₹|rs\.?|inr|\$|usd|€|£)\s*[\d,]+(?:\.\d{1,2})?/gi, ' ')
    .replace(
      /\b[\d,]+(?:\.\d{1,2})?\s*(k|lakhs?|lacs?|crores?|cr|rupees?|bucks?|dollars?)?\b/gi,
      ' ',
    )
    .replace(
      /\b(today|yesterday|yday|tonight|last night|this morning|this afternoon|this evening|day before yesterday)\b/gi,
      ' ',
    )
    .replace(/\b(spent|paid|bought|purchased|spend|pay|for|on|at|via|using|with|by)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return cleaned.length > 1 ? cleaned.slice(0, 120) : undefined;
}

/** Required fields the user still has to supply before this can be saved. */
export function gapsIn(draft: Pick<ExpenseDraft, 'amount' | 'category'>): DraftGap[] {
  const gaps: DraftGap[] = [];
  if (draft.amount === null || draft.amount <= 0) gaps.push('amount');
  if (!draft.category) gaps.push('category');
  return gaps;
}

/** "today" / "yesterday" / "3 Sep" — how a person would say the date back. */
function relativeDayLabel(when: Date, now: Date, timezone: string): string {
  const a = zonedParts(when, timezone);
  const b = zonedParts(now, timezone);
  const days = Math.round(
    (Date.UTC(b.year, b.month, b.day) - Date.UTC(a.year, a.month, a.day)) / 86_400_000,
  );
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days > 1 && days < 7) return `${days} days ago`;
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    timeZone: timezone,
  }).format(when);
}

/** The confirm sheet's one-liner: "INR 250 · Groceries · yesterday". */
export function summarize(
  draft: Pick<ExpenseDraft, 'amount' | 'category' | 'currency' | 'spentAt'>,
  now: Date,
  timezone: string,
): string {
  const parts: string[] = [];
  if (draft.amount !== null) {
    parts.push(`${draft.currency} ${draft.amount.toLocaleString('en-US')}`);
  }
  if (draft.category) {
    parts.push(draft.category);
  }
  parts.push(relativeDayLabel(new Date(draft.spentAt), now, timezone));
  return parts.join(' · ');
}

/**
 * The full offline parse. Confidence reflects how much of the sentence was actually
 * understood rather than defaulted: an amount and a category found is a draft worth
 * one tap; neither found is a draft worth a second look.
 */
export function parseExpenseHeuristically(text: string, ctx: ParseContext): ExpenseDraft {
  const amount = extractAmount(text);
  const category = extractCategory(text, ctx.categories);
  const spentAt = extractSpentAt(text, ctx.now, ctx.timezone);
  const paymentMethod = extractPaymentMethod(text);
  const description = extractDescription(text);

  const confidence = round2(
    (amount !== null ? 0.45 : 0) +
      (category ? 0.35 : 0) +
      (paymentMethod !== PaymentMethod.Other ? 0.1 : 0) +
      (description ? 0.1 : 0),
  );

  const draft: ExpenseDraft = {
    amount,
    currency: ctx.currency,
    category,
    description,
    paymentMethod,
    spentAt: spentAt.toISOString(),
    confidence,
    missing: [],
    summary: '',
  };

  draft.missing = gapsIn(draft);
  draft.summary = summarize(draft, ctx.now, ctx.timezone);
  return draft;
}
