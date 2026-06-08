import type { PaymentMethod } from '../../common/enums/payment-method';
import { computeSchedule, monthlyEquivalent } from './emi-schedule.util';
import type { EmiFrequency, EmiType } from './emis.enums';
import type { EmiDocument } from './emis.model';

const round2 = (value: number): number => Math.round(value * 100) / 100;
const isSameMonth = (a: Date, b: Date): boolean =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();

/**
 * Public shape of a recurring obligation, including the live schedule computed as of
 * "now": next due date, installments paid/remaining, remaining amount, projected end
 * date, completion, a monthly-equivalent figure (for commitment totals), and whether
 * the next payment falls in the current month.
 */
export interface EmiResponse {
  id: string;
  userId: string;
  name: string;
  type: EmiType;
  amount: number;
  currency: string;
  frequency: EmiFrequency;
  startDate: Date;
  category?: string;
  paymentMethod?: PaymentMethod;
  interestRatePct?: number;
  principal?: number;
  tenureCount?: number;
  autoDebit: boolean;
  isActive: boolean;
  notes?: string;
  nextDueDate?: Date;
  installmentsPaid: number;
  installmentsRemaining?: number;
  remainingAmount?: number;
  endDate?: Date;
  isCompleted: boolean;
  monthlyEquivalent: number;
  dueThisMonth: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/** Maps an EMI document to its public response, computing the live schedule from `now`. */
export function toEmiResponse(emi: EmiDocument, now: Date): EmiResponse {
  const schedule = computeSchedule(emi.startDate, emi.frequency, now, emi.tenureCount);
  const remainingAmount =
    schedule.installmentsRemaining !== undefined
      ? round2(schedule.installmentsRemaining * emi.amount)
      : undefined;

  return {
    id: emi._id.toString(),
    userId: emi.userId.toString(),
    name: emi.name,
    type: emi.type,
    amount: emi.amount,
    currency: emi.currency,
    frequency: emi.frequency,
    startDate: emi.startDate,
    category: emi.category,
    paymentMethod: emi.paymentMethod,
    interestRatePct: emi.interestRatePct,
    principal: emi.principal,
    tenureCount: emi.tenureCount,
    autoDebit: emi.autoDebit,
    isActive: emi.isActive,
    notes: emi.notes,
    nextDueDate: schedule.nextDueDate,
    installmentsPaid: schedule.installmentsPaid,
    installmentsRemaining: schedule.installmentsRemaining,
    remainingAmount,
    endDate: schedule.endDate,
    isCompleted: schedule.isCompleted,
    monthlyEquivalent: monthlyEquivalent(emi.amount, emi.frequency),
    dueThisMonth: schedule.nextDueDate ? isSameMonth(schedule.nextDueDate, now) : false,
    createdAt: emi.createdAt,
    updatedAt: emi.updatedAt,
  };
}
