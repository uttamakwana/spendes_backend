import { PlanType } from '../../common/enums/plan-type';

/**
 * A capability that can be gated behind a plan. Add a feature here, map it in
 * {@link PLAN_FEATURES}, then gate a route with `requireFeature(...)` or a service
 * call with `entitlementsService.assertFeature(...)`. During the MVP, enforcement
 * is OFF (see {@link EntitlementsService} and `ENTITLEMENTS_ENFORCED`), so every
 * feature is effectively granted regardless of the maps below — the maps just
 * encode the intended Pro/Free split for the day enforcement is switched on.
 */
export enum Feature {
  AdvancedAnalytics = 'advanced_analytics',
  UnlimitedGroups = 'unlimited_groups',
  UnlimitedBudgets = 'unlimited_budgets',
  RecurringAutomation = 'recurring_automation',
  DataExport = 'data_export',
  ReceiptScan = 'receipt_scan',
  MultiCurrency = 'multi_currency',
}

/** Numeric usage caps that differ by plan (consulted by future modules). */
export interface PlanLimits {
  maxGroups: number;
  maxBudgets: number;
  maxGoals: number;
}

const UNLIMITED = Number.POSITIVE_INFINITY;

/**
 * Features granted by each plan. Pro grants everything; Free is deny-by-default for
 * gateable extras (tighten/loosen this list when the Pro tier is designed). Only
 * consulted once enforcement is on.
 */
export const PLAN_FEATURES: Record<PlanType, ReadonlySet<Feature>> = {
  [PlanType.Pro]: new Set<Feature>(Object.values(Feature)),
  [PlanType.Free]: new Set<Feature>([]),
};

/** Per-plan numeric caps. Free is finite; Pro is unlimited. Only consulted once enforcement is on. */
export const PLAN_LIMITS: Record<PlanType, PlanLimits> = {
  [PlanType.Pro]: { maxGroups: UNLIMITED, maxBudgets: UNLIMITED, maxGoals: UNLIMITED },
  [PlanType.Free]: { maxGroups: 10, maxBudgets: 10, maxGoals: 10 },
};
