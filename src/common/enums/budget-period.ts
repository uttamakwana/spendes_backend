/**
 * The recurring window a budget's limit applies to. `Weekly`/`Monthly`/`Yearly`
 * repeat automatically — "spent" is always computed against the *current* period.
 * `Custom` uses an explicit `startDate`/`endDate` and does not repeat.
 */
export enum BudgetPeriod {
  Weekly = 'weekly',
  Monthly = 'monthly',
  Yearly = 'yearly',
  Custom = 'custom',
}
