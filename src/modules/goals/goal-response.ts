import { computeGoalMetrics } from './goal-progress.util';
import type { GoalContribution, GoalDocument } from './goals.model';

export interface GoalContributionResponse {
  id: string;
  amount: number;
  note?: string;
  contributedAt: Date;
}

/**
 * Public shape of a goal including its live progress: percent complete, amount left,
 * whether it's reached, and — when a target date is set — the time left and the
 * monthly saving needed to finish on time.
 */
export interface GoalResponse {
  id: string;
  userId: string;
  name: string;
  targetAmount: number;
  currentAmount: number;
  currency: string;
  targetDate?: Date;
  icon?: string;
  color?: string;
  notes?: string;
  progressPct: number;
  remainingAmount: number;
  isAchieved: boolean;
  daysRemaining?: number;
  monthsRemaining?: number;
  requiredMonthlySaving?: number;
  contributions: GoalContributionResponse[];
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const toContribution = (c: GoalContribution): GoalContributionResponse => ({
  id: c._id.toString(),
  amount: c.amount,
  note: c.note,
  contributedAt: c.contributedAt,
});

/** Maps a goal document to its public response, computing live progress from `now`. */
export function toGoalResponse(goal: GoalDocument, now: Date): GoalResponse {
  const metrics = computeGoalMetrics(goal.targetAmount, goal.currentAmount, now, goal.targetDate);

  return {
    id: goal._id.toString(),
    userId: goal.userId.toString(),
    name: goal.name,
    targetAmount: goal.targetAmount,
    currentAmount: goal.currentAmount,
    currency: goal.currency,
    targetDate: goal.targetDate,
    icon: goal.icon,
    color: goal.color,
    notes: goal.notes,
    progressPct: metrics.progressPct,
    remainingAmount: metrics.remainingAmount,
    isAchieved: metrics.isAchieved,
    daysRemaining: metrics.daysRemaining,
    monthsRemaining: metrics.monthsRemaining,
    requiredMonthlySaving: metrics.requiredMonthlySaving,
    contributions: (goal.contributions ?? []).map(toContribution),
    isActive: goal.isActive,
    createdAt: goal.createdAt,
    updatedAt: goal.updatedAt,
  };
}
