/**
 * Calendar arithmetic in a user's own timezone.
 *
 * Budgets, monthly summaries and cash-flow charts are all questions about a *human*
 * calendar — "how much did I spend this month?" — so their boundaries have to be
 * drawn in the asker's zone. Computing them in the server's zone was fine while
 * every user was in India and the server was too; with users in New York it puts
 * roughly ten and a half hours of spending in the wrong month.
 *
 * Implemented on `Intl` rather than a date library: Node ships the full ICU tz
 * database, and the alternative (a dependency plus its own tz data) buys nothing
 * here. All functions are pure.
 */

const DEFAULT_TIMEZONE = 'Asia/Kolkata';

/** Wall-clock fields of an instant, as seen in `timeZone`. */
export interface ZonedParts {
  year: number;
  /** 0-indexed, to match `Date`. */
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

/** Falls back to the app's original zone for a missing or unusable value. */
export function safeTimezone(timezone?: string | null): string {
  if (!timezone) return DEFAULT_TIMEZONE;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone });
    return timezone;
  } catch {
    return DEFAULT_TIMEZONE;
  }
}

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let formatter = formatterCache.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    formatterCache.set(timeZone, formatter);
  }
  return formatter;
}

/** The wall-clock date and time at `instant`, as seen in `timezone`. */
export function zonedParts(instant: Date, timezone: string): ZonedParts {
  const parts = formatterFor(safeTimezone(timezone)).formatToParts(instant);
  const value = (type: Intl.DateTimeFormatPartTypes): number => {
    const found = parts.find((p) => p.type === type)?.value ?? '0';
    return Number.parseInt(found, 10);
  };
  return {
    year: value('year'),
    month: value('month') - 1,
    day: value('day'),
    // Some ICU builds render midnight as hour 24 under hour12:false.
    hour: value('hour') % 24,
    minute: value('minute'),
    second: value('second'),
  };
}

/** The zone's UTC offset in milliseconds at a given instant (positive east of UTC). */
function offsetMs(instant: Date, timezone: string): number {
  const p = zonedParts(instant, timezone);
  const asIfUtc = Date.UTC(p.year, p.month, p.day, p.hour, p.minute, p.second);
  // Drop sub-second noise so the difference is a clean offset.
  return asIfUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

/**
 * The instant at which a wall clock in `timezone` reads the given date and time.
 *
 * Two passes: guess with the offset in force at the naive UTC instant, then correct
 * using the offset actually in force at that guess. That second pass is what makes
 * the day a clock changes come out right.
 */
export function zonedTimeToUtc(
  timezone: string,
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
  second = 0,
  millisecond = 0,
): Date {
  const zone = safeTimezone(timezone);
  const naive = Date.UTC(year, month, day, hour, minute, second, millisecond);
  const guess = new Date(naive - offsetMs(new Date(naive), zone));
  return new Date(naive - offsetMs(guess, zone));
}

/** An inclusive instant window [from, to]. */
export interface Window {
  from: Date;
  to: Date;
}

/** The window covering whole days `[fromDay, toDay]` of the zone's calendar. */
export function zonedDayWindow(
  timezone: string,
  from: { year: number; month: number; day: number },
  to: { year: number; month: number; day: number },
): Window {
  return {
    from: zonedTimeToUtc(timezone, from.year, from.month, from.day, 0, 0, 0, 0),
    to: zonedTimeToUtc(timezone, to.year, to.month, to.day, 23, 59, 59, 999),
  };
}

/** The calendar month containing `now`, in `timezone`. */
export function zonedMonthWindow(now: Date, timezone: string, monthsAgo = 0): Window {
  const p = zonedParts(now, timezone);
  const start = new Date(Date.UTC(p.year, p.month - monthsAgo, 1));
  const year = start.getUTCFullYear();
  const month = start.getUTCMonth();
  // Day 0 of the next month is the last day of this one.
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return zonedDayWindow(timezone, { year, month, day: 1 }, { year, month, day: lastDay });
}

/** The ISO week (Monday–Sunday) containing `now`, in `timezone`. */
export function zonedWeekWindow(now: Date, timezone: string): Window {
  const p = zonedParts(now, timezone);
  // Weekday of that calendar date, derived without touching the server's zone.
  const weekday = new Date(Date.UTC(p.year, p.month, p.day)).getUTCDay();
  const sinceMonday = (weekday + 6) % 7;
  const monday = new Date(Date.UTC(p.year, p.month, p.day - sinceMonday));
  const sunday = new Date(Date.UTC(p.year, p.month, p.day - sinceMonday + 6));
  return zonedDayWindow(
    timezone,
    { year: monday.getUTCFullYear(), month: monday.getUTCMonth(), day: monday.getUTCDate() },
    { year: sunday.getUTCFullYear(), month: sunday.getUTCMonth(), day: sunday.getUTCDate() },
  );
}

/** The calendar year containing `now`, in `timezone`. */
export function zonedYearWindow(now: Date, timezone: string): Window {
  const { year } = zonedParts(now, timezone);
  return zonedDayWindow(timezone, { year, month: 0, day: 1 }, { year, month: 11, day: 31 });
}

/** `YYYY-MM` for an instant as seen in `timezone` — the key monthly charts group by. */
export function zonedMonthKey(instant: Date, timezone: string): string {
  const { year, month } = zonedParts(instant, timezone);
  return `${year}-${String(month + 1).padStart(2, '0')}`;
}
