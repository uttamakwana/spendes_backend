/**
 * How a group expense's total is divided among members.
 * - `Equal`      — split evenly across the listed members.
 * - `Exact`      — each member owes a specified amount (must sum to the total).
 * - `Percentage` — each member owes a percentage (must sum to 100).
 * - `Shares`     — each member owes a proportional share/ratio (e.g. 2:1:1).
 */
export enum SplitStrategy {
  Equal = 'equal',
  Exact = 'exact',
  Percentage = 'percentage',
  Shares = 'shares',
}
