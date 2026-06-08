import { type FilterQuery, Types, type UpdateQuery } from 'mongoose';
import { PaymentMethod } from '../../common/enums/payment-method';
import { buildSort } from '../../common/utils/pagination';
import { paginate } from '../../common/utils/response';
import type { PaginatedData } from '../../common/types/api-response';
import { createLogger } from '../../logger';
import { usersService } from '../users/users.service';
import { toIncomeResponse, type IncomeResponse } from './income-response';
import type { IncomeDocument } from './income.model';
import { incomeRepository, IncomeRepository } from './income.repository';
import type {
  CreateIncomeInput,
  IncomeSummaryQuery,
  ListIncomeQuery,
  UpdateIncomeInput,
} from './income.validation';

/** Money is stored to 2 decimal places — round once, at the boundary. */
const toAmount = (value: number): number => Math.round(value * 100) / 100;

/** An income bucket keyed by some dimension (category, source). */
interface IncomeBucket {
  totalAmount: number;
  count: number;
}

/** Result of `GET /income/summary`: overall income plus dimensional breakdowns. */
export interface IncomeSummary {
  from?: Date;
  to?: Date;
  totalAmount: number;
  count: number;
  byCategory: (IncomeBucket & { category: string })[];
  bySource: (IncomeBucket & { source: string })[];
}

/**
 * Business logic for income. Every method is scoped to the owning `userId` — a
 * user can only ever read or mutate their own rows, and a miss surfaces as a 404
 * (never revealing that someone else's income exists). Amounts are normalized to
 * 2 decimals and currency defaults to the owner's `defaultCurrency`.
 */
export class IncomeService {
  private readonly logger = createLogger('IncomeService');

  constructor(private readonly repository: IncomeRepository) {}

  async create(userId: string, dto: CreateIncomeInput): Promise<IncomeResponse> {
    const currency = dto.currency?.toUpperCase() ?? (await this.resolveDefaultCurrency(userId));

    const income = await this.repository.create({
      userId: new Types.ObjectId(userId),
      amount: toAmount(dto.amount),
      currency,
      category: dto.category,
      source: dto.source,
      description: dto.description,
      receivedVia: dto.receivedVia ?? PaymentMethod.BankTransfer,
      receivedAt: dto.receivedAt ?? new Date(),
      notes: dto.notes,
      tags: dto.tags ?? [],
      isRecurring: dto.isRecurring ?? false,
    });

    this.logger.info(`Income created: ${income._id.toString()} by user ${userId}`);
    return toIncomeResponse(income);
  }

  async findAll(userId: string, query: ListIncomeQuery): Promise<PaginatedData<IncomeResponse>> {
    const filter: FilterQuery<IncomeDocument> = { userId };

    if (query.category) {
      filter.category = query.category;
    }
    if (query.receivedVia) {
      filter.receivedVia = query.receivedVia;
    }
    if (query.from || query.to) {
      filter.receivedAt = {
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
        { source: term },
        { category: term },
        { notes: term },
        { tags: term },
      ];
    }

    const result = await this.repository.paginate({
      filter,
      page: query.page,
      limit: query.limit,
      sort: buildSort(query) ?? { receivedAt: -1 },
    });

    return paginate(result.items.map(toIncomeResponse), {
      page: result.page,
      limit: result.limit,
      totalItems: result.totalItems,
    });
  }

  async findById(userId: string, id: string): Promise<IncomeResponse> {
    const income = await this.repository.findOwnedByIdOrThrow(id, userId);
    return toIncomeResponse(income);
  }

  async update(userId: string, id: string, dto: UpdateIncomeInput): Promise<IncomeResponse> {
    const update: UpdateQuery<IncomeDocument> = { ...dto };
    if (dto.amount !== undefined) {
      update.amount = toAmount(dto.amount);
    }
    if (dto.currency) {
      update.currency = dto.currency.toUpperCase();
    }

    const income = await this.repository.updateOwned(id, userId, update);
    return toIncomeResponse(income);
  }

  async remove(userId: string, id: string): Promise<void> {
    await this.repository.deleteOwned(id, userId);
  }

  async summary(userId: string, query: IncomeSummaryQuery): Promise<IncomeSummary> {
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
      bySource: agg.bySource.map((bucket) => ({
        source: bucket._id,
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
export const incomeService = new IncomeService(incomeRepository);
