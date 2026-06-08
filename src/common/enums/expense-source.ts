/**
 * Where a personal expense originated.
 * - `Personal`   — entered directly by the user.
 * - `GroupShare` — the user's share of a group (split) expense, materialized into
 *   their personal expenses so it counts in lists, summaries, budgets and analytics.
 *   These rows are read-only from the personal endpoints; they are created, updated
 *   and deleted in lock-step with the owning group expense (see the splits module).
 */
export enum ExpenseSource {
  Personal = 'personal',
  GroupShare = 'group_share',
}
