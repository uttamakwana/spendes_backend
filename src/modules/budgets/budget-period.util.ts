import { BudgetPeriod } from '../../common/enums/budget-period';

/** An inclusive date window [from, to]. */
export interface DateWindow {
  from: Date;
  to: Date;
}

/**
 * Resolves the active window for a budget given "now": the current calendar month,
 * ISO week (Monday–Sunday), or calendar year for recurring periods, or the explicit
 * `startDate`/`endDate` for a custom budget. Boundaries are in server-local time
 * (good enough for the India MVP; revisit if per-user timezones are added). Pure so
 * the service can pass `new Date()` and tests can pass a fixed date.
 */
export function resolvePeriodWindow(
  period: BudgetPeriod,
  now: Date,
  startDate?: Date,
  endDate?: Date,
): DateWindow {
  const year = now.getFullYear();
  const month = now.getMonth();
  const date = now.getDate();

  switch (period) {
    case BudgetPeriod.Yearly:
      return {
        from: new Date(year, 0, 1, 0, 0, 0, 0),
        to: new Date(year, 11, 31, 23, 59, 59, 999),
      };

    case BudgetPeriod.Weekly: {
      const day = now.getDay(); // 0 = Sunday … 6 = Saturday
      const daysSinceMonday = (day + 6) % 7;
      const from = new Date(year, month, date - daysSinceMonday, 0, 0, 0, 0);
      const to = new Date(from.getFullYear(), from.getMonth(), from.getDate() + 6, 23, 59, 59, 999);
      return { from, to };
    }

    case BudgetPeriod.Custom:
      return {
        from: startDate ?? new Date(year, month, 1, 0, 0, 0, 0),
        to: endDate ?? now,
      };

    case BudgetPeriod.Monthly:
    default:
      return {
        from: new Date(year, month, 1, 0, 0, 0, 0),
        to: new Date(year, month + 1, 0, 23, 59, 59, 999),
      };
  }
}
