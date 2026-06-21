/**
 * Pure recurrence math shared by any feature that schedules on a fixed cadence
 * (SIP contributions today; EMIs could adopt it later — its `EmiFrequency` values
 * are intentionally identical to {@link RecurrenceFrequency}). Given an anchor
 * `startDate` and a `frequency`, it derives how many occurrences have come due, the
 * next due date, and how to normalize a per-occurrence amount to a monthly figure.
 * Server-local time (fine for the India MVP). Kept pure so callers pass `new Date()`
 * and tests can pass a fixed date.
 */

/** The cadence of a recurring schedule. String values match `EmiFrequency`. */
export type RecurrenceFrequency = 'weekly' | 'monthly' | 'quarterly' | 'yearly';

/** Returns `date` advanced by `n` periods of `frequency` (n may be 0 or negative). */
export function addPeriods(date: Date, frequency: RecurrenceFrequency, n: number): Date {
  const y = date.getFullYear();
  const m = date.getMonth();
  const d = date.getDate();
  const hh = date.getHours();
  const mm = date.getMinutes();
  const ss = date.getSeconds();

  switch (frequency) {
    case 'weekly': {
      const result = new Date(date.getTime());
      result.setDate(d + n * 7);
      return result;
    }
    case 'quarterly':
      return new Date(y, m + n * 3, d, hh, mm, ss);
    case 'yearly':
      return new Date(y + n, m, d, hh, mm, ss);
    case 'monthly':
    default:
      return new Date(y, m + n, d, hh, mm, ss);
  }
}

/**
 * How many occurrences (starting at `startDate`) have come due as of `now`,
 * inclusive of one exactly at `now`. A `startDate` in the future returns 0.
 * Bounded so an old indefinite schedule can't loop forever.
 */
export function occurrencesUpTo(
  startDate: Date,
  frequency: RecurrenceFrequency,
  now: Date,
): number {
  const nowMs = now.getTime();
  const cap = 5000; // safety bound for very old start dates
  let count = 0;
  for (let k = 0; k < cap; k += 1) {
    if (addPeriods(startDate, frequency, k).getTime() <= nowMs) {
      count += 1;
    } else {
      break;
    }
  }
  return count;
}

/** The first occurrence strictly after `now` (the next due date). */
export function nextOccurrence(startDate: Date, frequency: RecurrenceFrequency, now: Date): Date {
  const due = occurrencesUpTo(startDate, frequency, now);
  return addPeriods(startDate, frequency, due);
}

/** Normalizes a per-occurrence `amount` to its monthly-equivalent figure. */
export function toMonthlyAmount(amount: number, frequency: RecurrenceFrequency): number {
  const round2 = (v: number): number => Math.round(v * 100) / 100;
  switch (frequency) {
    case 'weekly':
      return round2((amount * 52) / 12);
    case 'quarterly':
      return round2(amount / 3);
    case 'yearly':
      return round2(amount / 12);
    case 'monthly':
    default:
      return amount;
  }
}
