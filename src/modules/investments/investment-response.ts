import type { InvestmentType } from './investments.enums';
import type { InvestmentDocument } from './investments.model';

const round2 = (value: number): number => Math.round(value * 100) / 100;

/**
 * Public shape of a holding plus its computed return: absolute gain/loss
 * (`currentValue − investedAmount`) and the percentage on cost.
 */
export interface InvestmentResponse {
  id: string;
  userId: string;
  name: string;
  type: InvestmentType;
  investedAmount: number;
  currentValue: number;
  currency: string;
  quantity?: number;
  platform?: string;
  notes?: string;
  gainLoss: number;
  gainLossPct: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/** Maps an investment document to its public response with computed gain/loss. */
export function toInvestmentResponse(investment: InvestmentDocument): InvestmentResponse {
  const gainLoss = round2(investment.currentValue - investment.investedAmount);
  const gainLossPct =
    investment.investedAmount > 0 ? round2((gainLoss / investment.investedAmount) * 100) : 0;

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
    isActive: investment.isActive,
    createdAt: investment.createdAt,
    updatedAt: investment.updatedAt,
  };
}
