import { BudgetPeriod } from '../../common/enums/budget-period';
import {
  safeTimezone,
  zonedMonthWindow,
  zonedWeekWindow,
  zonedYearWindow,
  type Window,
} from '../../common/utils/timezone';

/** An inclusive date window [from, to]. */
export type DateWindow = Window;

/**
 * Resolves the active window for a budget given "now": the current calendar month,
 * ISO week (Monday–Sunday), or calendar year for recurring periods, or the explicit
 * `startDate`/`endDate` for a custom budget.
 *
 * Boundaries are drawn in `timezone` — the budget owner's zone — because "this
 * month" is a question about their calendar, not the server's. A user in New York
 * asking on the 31st at 8pm is still in this month even though the server (in IST)
 * has already rolled over. Pure, so the service can pass `new Date()` and tests can
 * pass a fixed instant.
 */
export function resolvePeriodWindow(
  period: BudgetPeriod,
  now: Date,
  timezone?: string,
  startDate?: Date,
  endDate?: Date,
): DateWindow {
  const zone = safeTimezone(timezone);

  switch (period) {
    case BudgetPeriod.Yearly:
      return zonedYearWindow(now, zone);

    case BudgetPeriod.Weekly:
      return zonedWeekWindow(now, zone);

    case BudgetPeriod.Custom: {
      const fallback = zonedMonthWindow(now, zone);
      return { from: startDate ?? fallback.from, to: endDate ?? now };
    }

    case BudgetPeriod.Monthly:
    default:
      return zonedMonthWindow(now, zone);
  }
}
