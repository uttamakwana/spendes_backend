/** How often an obligation recurs. */
export enum EmiFrequency {
  Weekly = 'weekly',
  Monthly = 'monthly',
  Quarterly = 'quarterly',
  Yearly = 'yearly',
}

/** What kind of recurring commitment this is (drives icons/grouping in the app). */
export enum EmiType {
  Loan = 'loan',
  Subscription = 'subscription',
  Rent = 'rent',
  Insurance = 'insurance',
  Other = 'other',
}
