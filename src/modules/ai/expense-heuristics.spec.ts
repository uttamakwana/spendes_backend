import { PaymentMethod } from '../../common/enums/payment-method';
import { zonedParts } from '../../common/utils/timezone';
import {
  extractAmount,
  extractCategory,
  extractPaymentMethod,
  extractSpentAt,
  parseExpenseHeuristically,
  type CategoryChoice,
} from './expense-heuristics';

const CATEGORIES: CategoryChoice[] = [
  { name: 'Food & Dining', slug: 'food-dining' },
  { name: 'Groceries', slug: 'groceries' },
  { name: 'Transport', slug: 'transport' },
  { name: 'Shopping', slug: 'shopping' },
  { name: 'Mobile & Internet', slug: 'mobile-internet' },
];

const TIMEZONE = 'Asia/Kolkata';
// A fixed instant so every date assertion is deterministic: 2026-09-07 is a Monday,
// 18:30 UTC — which is already 2026-09-08 in Kolkata, the case a naive
// implementation gets wrong.
const NOW = new Date('2026-09-07T18:30:00.000Z');

const ctx = { categories: CATEGORIES, now: NOW, timezone: TIMEZONE, currency: 'INR' };

/** The calendar day an instant falls on, in the test's zone. */
const dayIn = (instant: Date): string => {
  const p = zonedParts(instant, TIMEZONE);
  return `${p.year}-${String(p.month + 1).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
};

describe('extractAmount', () => {
  it('reads a bare figure', () => {
    expect(extractAmount('spent 250 on groceries')).toBe(250);
  });

  it('prefers the figure attached to a currency marker over other numbers', () => {
    expect(extractAmount('2 coffees for ₹340')).toBe(340);
  });

  it('handles thousands separators and decimals', () => {
    expect(extractAmount('paid 1,250.50 for the flight')).toBe(1250.5);
  });

  it('applies Indian and metric scale suffixes', () => {
    expect(extractAmount('rent 1.5k')).toBe(1500);
    expect(extractAmount('bought a car for 8 lakh')).toBe(800000);
  });

  it('does not mistake a clock time for money', () => {
    expect(extractAmount('dinner at 8pm cost 600')).toBe(600);
  });

  it('does not mistake a relative-day count for money', () => {
    expect(extractAmount('paid 450 for petrol 3 days ago')).toBe(450);
  });

  it('returns null when the text names no amount', () => {
    expect(extractAmount('had lunch with Priya')).toBeNull();
  });
});

describe('extractCategory', () => {
  it('matches on a synonym that is not in the category name', () => {
    expect(extractCategory('swiggy order last night', CATEGORIES)).toBe('Food & Dining');
  });

  it('matches on the category name itself', () => {
    expect(extractCategory('weekly groceries', CATEGORIES)).toBe('Groceries');
  });

  it('returns null rather than guessing when nothing points at a category', () => {
    expect(extractCategory('paid 500 to Rahul', CATEGORIES)).toBeNull();
  });

  it('only ever returns a category from the supplied list', () => {
    const result = extractCategory('uber to the airport', CATEGORIES);
    expect(CATEGORIES.map((c) => c.name)).toContain(result);
  });
});

describe('extractPaymentMethod', () => {
  it('recognises UPI apps by name', () => {
    expect(extractPaymentMethod('paid 200 via gpay')).toBe(PaymentMethod.Upi);
  });

  it('recognises cash', () => {
    expect(extractPaymentMethod('gave 100 in cash')).toBe(PaymentMethod.Cash);
  });

  it('falls back to other when no rail is named', () => {
    expect(extractPaymentMethod('spent 250 on groceries')).toBe(PaymentMethod.Other);
  });
});

describe('extractSpentAt', () => {
  it('resolves "yesterday" against the user calendar, not the server one', () => {
    // In Kolkata it is already the 8th, so "yesterday" is the 7th — a server
    // working in UTC would answer the 6th.
    expect(dayIn(extractSpentAt('spent 250 yesterday', NOW, TIMEZONE))).toBe('2026-09-07');
  });

  it('resolves "day before yesterday"', () => {
    expect(dayIn(extractSpentAt('paid 400 day before yesterday', NOW, TIMEZONE))).toBe(
      '2026-09-06',
    );
  });

  it('resolves "N days ago"', () => {
    expect(dayIn(extractSpentAt('petrol 3 days ago', NOW, TIMEZONE))).toBe('2026-09-05');
  });

  it('resolves a named weekday to its most recent occurrence', () => {
    // 2026-09-08 in Kolkata is a Tuesday, so the last Friday was the 4th.
    expect(dayIn(extractSpentAt('dinner on friday', NOW, TIMEZONE))).toBe('2026-09-04');
  });

  it('defaults to now when the text names no date', () => {
    expect(extractSpentAt('spent 250 on groceries', NOW, TIMEZONE)).toEqual(NOW);
  });

  it('never returns a future instant for a past-tense phrase', () => {
    const when = extractSpentAt('spent 250 last night', NOW, TIMEZONE);
    expect(when.getTime()).toBeLessThanOrEqual(NOW.getTime());
  });
});

describe('parseExpenseHeuristically', () => {
  it('parses the canonical sentence into a complete draft', () => {
    const draft = parseExpenseHeuristically('spent 250 on groceries yesterday', ctx);

    expect(draft.amount).toBe(250);
    expect(draft.category).toBe('Groceries');
    expect(dayIn(new Date(draft.spentAt))).toBe('2026-09-07');
    expect(draft.currency).toBe('INR');
    expect(draft.missing).toEqual([]);
    expect(draft.summary).toContain('Groceries');
    expect(draft.summary).toContain('yesterday');
  });

  it('reports the fields it could not fill instead of inventing them', () => {
    const draft = parseExpenseHeuristically('paid Rahul back', ctx);

    expect(draft.amount).toBeNull();
    expect(draft.category).toBeNull();
    expect(draft.missing).toEqual(['amount', 'category']);
  });

  it('scores confidence higher the more of the sentence it understood', () => {
    const rich = parseExpenseHeuristically('spent 250 on groceries via gpay yesterday', ctx);
    const sparse = parseExpenseHeuristically('spent 250', ctx);

    expect(rich.confidence).toBeGreaterThan(sparse.confidence);
    expect(rich.confidence).toBeLessThanOrEqual(1);
  });

  it('is pure — the same input always yields the same draft', () => {
    const text = 'uber to office 180 rupees yesterday';
    expect(parseExpenseHeuristically(text, ctx)).toEqual(parseExpenseHeuristically(text, ctx));
  });
});
