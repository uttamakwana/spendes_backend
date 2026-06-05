/**
 * How money left the account for a transaction. Lives in `common` because it is a
 * shared finance concept reused beyond expenses (income, EMIs, settlements). `Upi`
 * is first-class for the India MVP; widen the enum as new rails are supported.
 */
export enum PaymentMethod {
  Cash = 'cash',
  Card = 'card',
  Upi = 'upi',
  BankTransfer = 'bank_transfer',
  Wallet = 'wallet',
  Other = 'other',
}
