/**
 * Whether a category classifies money going out or coming in. A single category
 * belongs to exactly one side — expense and income categories are kept separate so
 * pickers and analytics stay unambiguous. Used by the expenses module today and the
 * income module later.
 */
export enum CategoryType {
  Expense = 'expense',
  Income = 'income',
}
