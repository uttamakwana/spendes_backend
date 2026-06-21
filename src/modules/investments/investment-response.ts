import { nextOccurrence, occurrencesUpTo, toMonthlyAmount } from '../../common/utils/recurrence';
import type { SipFrequency } from './investments.enums';
import type { InvestmentContribution, InvestmentDocument } from './investments.model';

const round2 = (value: number): number => Math.round(value * 100) / 100;

/** One recorded contribution in the holding's history. */
export interface InvestmentContributionResponse {
  id: string;
  amount: number;
  note?: string;
  investedAt: Date;
}

/** The live, derived view of a holding's SIP plan as of "now". */
export interface SipResponse {
  amount: number;
  frequency: SipFrequency;
  startDate: Date;
  isActive: boolean;
  /** The per-installment amount normalized to a monthly figure (for commitment totals). */
  monthlyEquivalent: number;
  /** Next scheduled contribution date (omitted when the plan is paused). */
  nextContributionDate?: Date;
  /** How many installments should have been made by now (since `startDate`). */
  expectedInstallments: number;
  /** How many contributions have actually been recorded. */
  recordedInstallments: number;
  /** `max(0, expected − recorded)` — installments the user may be behind on. */
  installmentsBehind: number;
}

/**
 * Public shape of a holding plus its computed return: absolute gain/loss
 * (`currentValue − investedAmount`) and the percentage on cost. When a SIP plan is
 * attached, its live schedule is derived too.
 */
export interface InvestmentResponse {
  id: string;
  userId: string;
  name: string;
  type: InvestmentDocument['type'];
  investedAmount: number;
  currentValue: number;
  currency: string;
  quantity?: number;
  platform?: string;
  notes?: string;
  gainLoss: number;
  gainLossPct: number;
  sip?: SipResponse;
  contributions: InvestmentContributionResponse[];
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const toContribution = (c: InvestmentContribution): InvestmentContributionResponse => ({
  id: c._id.toString(),
  amount: c.amount,
  note: c.note,
  investedAt: c.investedAt,
});

/** Derives the live SIP view (schedule + recorded vs expected) from the plan. */
function toSipResponse(
  sip: NonNullable<InvestmentDocument['sip']>,
  recordedInstallments: number,
  now: Date,
): SipResponse {
  const expectedInstallments = occurrencesUpTo(sip.startDate, sip.frequency, now);
  return {
    amount: sip.amount,
    frequency: sip.frequency,
    startDate: sip.startDate,
    isActive: sip.isActive,
    monthlyEquivalent: toMonthlyAmount(sip.amount, sip.frequency),
    nextContributionDate: sip.isActive
      ? nextOccurrence(sip.startDate, sip.frequency, now)
      : undefined,
    expectedInstallments,
    recordedInstallments,
    installmentsBehind: Math.max(0, expectedInstallments - recordedInstallments),
  };
}

/** Maps an investment document to its public response, computing gain/loss + SIP schedule from `now`. */
export function toInvestmentResponse(
  investment: InvestmentDocument,
  now: Date,
): InvestmentResponse {
  const gainLoss = round2(investment.currentValue - investment.investedAmount);
  const gainLossPct =
    investment.investedAmount > 0 ? round2((gainLoss / investment.investedAmount) * 100) : 0;
  const contributions = investment.contributions ?? [];

  return {
    id: investment._id.toString(),
    userId: investment.userId.toString(),
    name: investment.name,
    type: investment.type,
    investedAmount: investment.investedAmount,
    currentValue: investment.currentValue,
    currency: investment.currency,
    quantity: investment.quantity,
    platform: investment.platform,
    notes: investment.notes,
    gainLoss,
    gainLossPct,
    sip: investment.sip ? toSipResponse(investment.sip, contributions.length, now) : undefined,
    contributions: contributions.map(toContribution),
    isActive: investment.isActive,
    createdAt: investment.createdAt,
    updatedAt: investment.updatedAt,
  };
}
