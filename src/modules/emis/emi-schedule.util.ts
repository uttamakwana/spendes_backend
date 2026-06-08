import { EmiFrequency } from './emis.enums';

/**
 * Pure scheduling math for recurring obligations. Given a first-due `startDate`, a
 * `frequency`, and an optional finite `tenureCount` (e.g. a loan's number of
 * installments), it derives how many installments have come due, the next due date,
 * the projected end date, and whether the schedule is complete. Server-local time
 * (fine for the India MVP). Kept pure so the service passes `new Date()` and tests
 * can pass a fixed date.
 */

/** Returns `date` advanced by `n` periods of `frequency`. */
export function addPeriods(date: Date, frequency: EmiFrequency, n: number): Date {
  const y = date.getFullYear();
  const m = date.getMonth();
  const d = date.getDate();
  const hh = date.getHours();
  const mm = date.getMinutes();
  const ss = date.getSeconds();

  switch (frequency) {
    case EmiFrequency.Weekly: {
      const result = new Date(date.getTime());
      result.setDate(d + n * 7);
      return result;
    }
    case EmiFrequency.Quarterly:
      return new Date(y, m + n * 3, d, hh, mm, ss);
    case EmiFrequency.Yearly:
      return new Date(y + n, m, d, hh, mm, ss);
    case EmiFrequency.Monthly:
    default:
      return new Date(y, m + n, d, hh, mm, ss);
  }
}

export interface EmiSchedule {
  /** How many installments have come due as of `now`. */
  installmentsPaid: number;
  /** Remaining installments — only for a finite (tenured) obligation. */
  installmentsRemaining?: number;
  /** Next due date, or undefined when a finite schedule is complete. */
  nextDueDate?: Date;
  /** Projected final installment date — only for a finite obligation. */
  endDate?: Date;
  isCompleted: boolean;
}

/** Derives the live schedule for an obligation as of `now`. */
export function computeSchedule(
  startDate: Date,
  frequency: EmiFrequency,
  now: Date,
  tenureCount?: number,
): EmiSchedule {
  const cap = tenureCount ?? 1200; // safety bound for indefinite schedules
  const nowMs = now.getTime();

  let paid = 0;
  let nextDueDate: Date | undefined;
  for (let k = 0; k < cap; k += 1) {
    const due = addPeriods(startDate, frequency, k);
    if (due.getTime() <= nowMs) {
      paid += 1;
    } else {
      nextDueDate = due;
      break;
    }
  }

  const endDate =
    tenureCount !== undefined ? addPeriods(startDate, frequency, tenureCount - 1) : undefined;
  const isCompleted = tenureCount !== undefined ? paid >= tenureCount : false;
  if (isCompleted) {
    nextDueDate = undefined;
  }
  const installmentsRemaining =
    tenureCount !== undefined ? Math.max(0, tenureCount - paid) : undefined;

  return {
    installmentsPaid: tenureCount !== undefined ? Math.min(paid, tenureCount) : paid,
    installmentsRemaining,
    nextDueDate,
    endDate,
    isCompleted,
  };
}

/** Normalizes a per-period amount to a monthly-equivalent figure (for commitment totals). */
export function monthlyEquivalent(amount: number, frequency: EmiFrequency): number {
  const round2 = (v: number): number => Math.round(v * 100) / 100;
  switch (frequency) {
    case EmiFrequency.Weekly:
      return round2((amount * 52) / 12);
    case EmiFrequency.Quarterly:
      return round2(amount / 3);
    case EmiFrequency.Yearly:
      return round2(amount / 12);
    case EmiFrequency.Monthly:
    default:
      return amount;
  }
}
