import { type FilterQuery, Types, type UpdateQuery } from 'mongoose';
import { PaymentMethod } from '../../common/enums/payment-method';
import { ExpenseSource } from '../../common/enums/expense-source';
import { BadRequestException } from '../../common/errors/http-exception';
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

/** Input for materializing a member's share of a group expense into their expenses. */
export interface GroupShareExpenseInput {
  userId: string;
  amount: number;
  /** Cash this member actually paid as the bill's payer (their `paidBy` total); 0 if none. */
  paidAmount: number;
  currency: string;
  category: string;
  description?: string;
  notes?: string;
  spentAt: Date;
  groupId: string;
  groupExpenseId: string;
}

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
  /**
   * Actual cash paid out of pocket over the window — sums each personal row's `amount`
   * plus the user's payer share of splits (`paidAmount`), ignoring shares others paid.
   * Differs from `totalAmount` (consumption/your share) when you front a split.
   */
  cashOutflow: number;
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
    if (query.source) {
      filter.source = query.source;
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
    const existing = await this.repository.findOwnedByIdOrThrow(id, userId);
    this.assertDirectlyEditable(existing);

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
    const existing = await this.repository.findOwnedByIdOrThrow(id, userId);
    this.assertDirectlyEditable(existing);
    await this.repository.deleteOwned(id, userId);
  }

  // ---------------------------------------------------------------------------
  // Group-share materialization (called by the splits module — see SplitsService)
  // ---------------------------------------------------------------------------

  /** Creates the personal "your share" row for a member of a group expense. */
  async createGroupShareExpense(input: GroupShareExpenseInput): Promise<void> {
    await this.repository.create({
      userId: new Types.ObjectId(input.userId),
      amount: toAmount(input.amount),
      paidAmount: toAmount(input.paidAmount),
      currency: input.currency,
      category: input.category,
      description: input.description,
      paymentMethod: PaymentMethod.Other,
      spentAt: input.spentAt,
      notes: input.notes,
      tags: [],
      source: ExpenseSource.GroupShare,
      groupId: new Types.ObjectId(input.groupId),
      groupExpenseId: new Types.ObjectId(input.groupExpenseId),
    });
  }

  /** Propagates metadata edits from a group expense to every member's share row. */
  async syncGroupShareExpenses(
    groupExpenseId: string,
    fields: { description?: string; category?: string; spentAt?: Date; notes?: string },
  ): Promise<void> {
    await this.repository.updateByGroupExpense(groupExpenseId, fields);
  }

  /** Removes all share rows for a deleted group expense. */
  async removeGroupShareExpenses(groupExpenseId: string): Promise<void> {
    await this.repository.deleteByGroupExpense(groupExpenseId);
  }

  /** Whether a user already has a share row for a group expense (dedup for backfill). */
  hasGroupShareExpense(userId: string, groupExpenseId: string): Promise<boolean> {
    return this.repository.existsGroupShare(userId, groupExpenseId);
  }

  /** Total spend for a user within a date window (optionally one category). Used by budgets. */
  sumForPeriod(
    userId: string,
    range: { from: Date; to: Date },
    category?: string,
  ): Promise<number> {
    return this.repository.sumAmount(userId, range, category);
  }

  /** Group-share rows are owned by their group expense; they can't be edited/deleted here. */
  private assertDirectlyEditable(expense: ExpenseDocument): void {
    if (expense.source === ExpenseSource.GroupShare) {
      throw new BadRequestException(
        'This is your share of a group expense — edit or delete it from the group instead.',
      );
    }
  }

  async summary(userId: string, query: ExpenseSummaryQuery): Promise<ExpenseSummary> {
    const agg = await this.repository.summarize(userId, { from: query.from, to: query.to });
    const overall = agg.overall[0] ?? { totalAmount: 0, cashOutflow: 0, count: 0 };

    return {
      from: query.from,
      to: query.to,
      totalAmount: toAmount(overall.totalAmount),
      cashOutflow: toAmount(overall.cashOutflow ?? 0),
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
