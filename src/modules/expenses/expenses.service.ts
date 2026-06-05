import { type FilterQuery, Types, type UpdateQuery } from 'mongoose';
import { PaymentMethod } from '../../common/enums/payment-method';
import { buildSort } from '../../common/utils/pagination';
import { paginate } from '../../common/utils/response';
import type { PaginatedData } from '../../common/types/api-response';
import { createLogger } from '../../logger';
import { usersService } from '../users/users.service';
import { toExpenseResponse, type ExpenseResponse } from './expense-response';
import type { ExpenseDocument } from './expenses.model';
import { expensesRepository, ExpensesRepository } from './expenses.repository';
import type {
  CreateExpenseInput,
  ExpenseSummaryQuery,
  ListExpensesQuery,
  UpdateExpenseInput,
} from './expenses.validation';

/** Money is stored to 2 decimal places — round once, at the boundary. */
const toAmount = (value: number): number => Math.round(value * 100) / 100;

/** A spend bucket keyed by some dimension (category, payment method). */
interface SpendBucket {
  totalAmount: number;
  count: number;
}

/** Result of `GET /expenses/summary`: overall spend plus dimensional breakdowns. */
export interface ExpenseSummary {
  from?: Date;
  to?: Date;
  totalAmount: number;
  count: number;
  byCategory: (SpendBucket & { category: string })[];
  byPaymentMethod: (SpendBucket & { paymentMethod: PaymentMethod })[];
}

/**
 * Business logic for expenses. Every method is scoped to the owning `userId` — a
 * user can only ever read or mutate their own rows, and a miss surfaces as a 404
 * (never revealing that someone else's expense exists). Amounts are normalized to
 * 2 decimals and currency defaults to the owner's `defaultCurrency`.
 */
export class ExpensesService {
  private readonly logger = createLogger('ExpensesService');

  constructor(private readonly repository: ExpensesRepository) {}

  async create(userId: string, dto: CreateExpenseInput): Promise<ExpenseResponse> {
    const currency = dto.currency?.toUpperCase() ?? (await this.resolveDefaultCurrency(userId));

    const expense = await this.repository.create({
      userId: new Types.ObjectId(userId),
      amount: toAmount(dto.amount),
      currency,
      category: dto.category,
      description: dto.description,
      merchant: dto.merchant,
      paymentMethod: dto.paymentMethod ?? PaymentMethod.Other,
      spentAt: dto.spentAt ?? new Date(),
      notes: dto.notes,
      tags: dto.tags ?? [],
      receiptUrl: dto.receiptUrl,
    });

    this.logger.info(`Expense created: ${expense._id.toString()} by user ${userId}`);
    return toExpenseResponse(expense);
  }

  async findAll(userId: string, query: ListExpensesQuery): Promise<PaginatedData<ExpenseResponse>> {
    const filter: FilterQuery<ExpenseDocument> = { userId };

    if (query.category) {
      filter.category = query.category;
    }
    if (query.paymentMethod) {
      filter.paymentMethod = query.paymentMethod;
    }
    if (query.from || query.to) {
      filter.spentAt = {
        ...(query.from ? { $gte: query.from } : {}),
        ...(query.to ? { $lte: query.to } : {}),
      };
    }
    if (query.minAmount !== undefined || query.maxAmount !== undefined) {
      filter.amount = {
        ...(query.minAmount !== undefined ? { $gte: query.minAmount } : {}),
        ...(query.maxAmount !== undefined ? { $lte: query.maxAmount } : {}),
      };
    }
    if (query.search) {
      const term = new RegExp(query.search, 'i');
      filter.$or = [
        { description: term },
        { merchant: term },
        { category: term },
        { notes: term },
        { tags: term },
      ];
    }

    const result = await this.repository.paginate({
      filter,
      page: query.page,
      limit: query.limit,
      sort: buildSort(query) ?? { spentAt: -1 },
    });

    return paginate(result.items.map(toExpenseResponse), {
      page: result.page,
      limit: result.limit,
      totalItems: result.totalItems,
    });
  }

  async findById(userId: string, id: string): Promise<ExpenseResponse> {
    const expense = await this.repository.findOwnedByIdOrThrow(id, userId);
    return toExpenseResponse(expense);
  }

  async update(userId: string, id: string, dto: UpdateExpenseInput): Promise<ExpenseResponse> {
    const update: UpdateQuery<ExpenseDocument> = { ...dto };
    if (dto.amount !== undefined) {
      update.amount = toAmount(dto.amount);
    }
    if (dto.currency) {
      update.currency = dto.currency.toUpperCase();
    }

    const expense = await this.repository.updateOwned(id, userId, update);
    return toExpenseResponse(expense);
  }

  async remove(userId: string, id: string): Promise<void> {
    await this.repository.deleteOwned(id, userId);
  }

  async summary(userId: string, query: ExpenseSummaryQuery): Promise<ExpenseSummary> {
    const agg = await this.repository.summarize(userId, { from: query.from, to: query.to });
    const overall = agg.overall[0] ?? { totalAmount: 0, count: 0 };

    return {
      from: query.from,
      to: query.to,
      totalAmount: toAmount(overall.totalAmount),
      count: overall.count,
      byCategory: agg.byCategory.map((bucket) => ({
        category: bucket._id,
        totalAmount: toAmount(bucket.totalAmount),
        count: bucket.count,
      })),
      byPaymentMethod: agg.byPaymentMethod.map((bucket) => ({
        paymentMethod: bucket._id as PaymentMethod,
        totalAmount: toAmount(bucket.totalAmount),
        count: bucket.count,
      })),
    };
  }

  /** Falls back to the owner's configured default currency (then INR) when none is supplied. */
  private async resolveDefaultCurrency(userId: string): Promise<string> {
    const user = await usersService.findEntityById(userId);
    return user?.defaultCurrency ?? 'INR';
  }
}

/** Shared singleton instance used across the app. */
export const expensesService = new ExpensesService(expensesRepository);
