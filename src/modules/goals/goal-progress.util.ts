const round2 = (value: number): number => Math.round(value * 100) / 100;
const MS_PER_DAY = 86_400_000;
const DAYS_PER_MONTH = 30.44;

/** The live, derived view of a goal's progress as of "now". */
export interface GoalMetrics {
  /** 0–100, capped. */
  progressPct: number;
  remainingAmount: number;
  isAchieved: boolean;
  daysRemaining?: number;
  monthsRemaining?: number;
  /** What to set aside per month to reach the target by `targetDate` (0 if achieved). */
  requiredMonthlySaving?: number;
}

/**
 * Pure goal-progress math. Derives percent complete, what's left, whether it's
 * reached, and — when a `targetDate` is set — the time left and the monthly saving
 * needed to get there on time. Kept pure so the service passes `new Date()`.
 */
export function computeGoalMetrics(
  targetAmount: number,
  currentAmount: number,
  now: Date,
  targetDate?: Date,
): GoalMetrics {
  const remainingAmount = Math.max(0, round2(targetAmount - currentAmount));
  const progressPct =
    targetAmount > 0 ? round2(Math.min(100, (currentAmount / targetAmount) * 100)) : 0;
  const isAchieved = currentAmount >= targetAmount;

  if (!targetDate) {
    return { progressPct, remainingAmount, isAchieved };
  }

  const daysRemaining = Math.max(0, Math.ceil((targetDate.getTime() - now.getTime()) / MS_PER_DAY));
  const monthsRemaining = Math.max(0, Math.ceil(daysRemaining / DAYS_PER_MONTH));
  const requiredMonthlySaving = isAchieved
    ? 0
    : monthsRemaining > 0
      ? round2(remainingAmount / monthsRemaining)
      : remainingAmount;

  return {
    progressPct,
    remainingAmount,
    isAchieved,
    daysRemaining,
    monthsRemaining,
    requiredMonthlySaving,
  };
}
