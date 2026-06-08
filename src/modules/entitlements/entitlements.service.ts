import { config } from '../../config';
import { PaymentRequiredException } from '../../common/errors/http-exception';
import type { PlanType } from '../../common/enums/plan-type';
import { Feature, PLAN_FEATURES, PLAN_LIMITS, type PlanLimits } from './entitlements.config';

/**
 * The single decision point for "is this user allowed to do X on their plan?".
 *
 * Enforcement is gated by `ENTITLEMENTS_ENFORCED` (off in the MVP): while off,
 * every `can()` is `true` and every limit is unbounded, so the gate is a dormant
 * pass-through that callers can wire in today without changing behaviour. Flip the
 * env to `true` (and finalize the maps in {@link Feature}'s config) to turn paid
 * gating on without touching any call site.
 */
export class EntitlementsService {
  /** Whether plan gating is actively enforced. OFF during the MVP (everything free). */
  private get enforced(): boolean {
    return config.entitlements.enforced;
  }

  /** True if `plan` may use `feature`. Always true while enforcement is off (MVP). */
  can(plan: PlanType, feature: Feature): boolean {
    if (!this.enforced) {
      return true;
    }
    return PLAN_FEATURES[plan]?.has(feature) ?? false;
  }

  /** Throws 402 `UPGRADE_REQUIRED` when `plan` is not entitled to `feature`. */
  assertFeature(plan: PlanType, feature: Feature): void {
    if (!this.can(plan, feature)) {
      throw new PaymentRequiredException(`Upgrade to Pro to use this feature (${feature}).`);
    }
  }

  /** The numeric cap for `key` under `plan` (Infinity while enforcement is off). */
  limitFor(plan: PlanType, key: keyof PlanLimits): number {
    if (!this.enforced) {
      return Number.POSITIVE_INFINITY;
    }
    return PLAN_LIMITS[plan]?.[key] ?? 0;
  }

  /** Throws 402 when `currentCount` is already at/over the plan's cap for `key`. */
  assertWithinLimit(plan: PlanType, key: keyof PlanLimits, currentCount: number): void {
    const limit = this.limitFor(plan, key);
    if (currentCount >= limit) {
      throw new PaymentRequiredException(
        `Your plan allows up to ${limit} for "${key}". Upgrade to Pro for more.`,
      );
    }
  }
}

/** Shared singleton instance used across the app. */
export const entitlementsService = new EntitlementsService();
