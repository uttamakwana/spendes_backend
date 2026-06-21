/** Asset class of a holding (drives icons/allocation grouping in the app). */
export enum InvestmentType {
  MutualFund = 'mutual_fund',
  Stock = 'stock',
  Fd = 'fd',
  Gold = 'gold',
  Crypto = 'crypto',
  Bond = 'bond',
  RealEstate = 'real_estate',
  Other = 'other',
}

/**
 * Cadence of a recurring contribution plan (SIP). String values mirror
 * `EmiFrequency` and the shared `RecurrenceFrequency` so the recurrence helpers
 * apply unchanged.
 */
export enum SipFrequency {
  Weekly = 'weekly',
  Monthly = 'monthly',
  Quarterly = 'quarterly',
  Yearly = 'yearly',
}
