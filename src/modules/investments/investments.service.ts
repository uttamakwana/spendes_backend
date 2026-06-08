import { type FilterQuery, Types, type UpdateQuery } from 'mongoose';
import { buildSort } from '../../common/utils/pagination';
import { paginate } from '../../common/utils/response';
import type { PaginatedData } from '../../common/types/api-response';
import { createLogger } from '../../logger';
import { usersService } from '../users/users.service';
import type { InvestmentType } from './investments.enums';
import { toInvestmentResponse, type InvestmentResponse } from './investment-response';
import type { InvestmentDocument } from './investments.model';
import { investmentsRepository, InvestmentsRepository } from './investments.repository';
import type {
  CreateInvestmentInput,
  ListInvestmentsQuery,
  UpdateInvestmentInput,
} from './investments.validation';

/** Money is stored to 2 decimal places — round once, at the boundary. */
const toAmount = (value: number): number => Math.round(value * 100) / 100;

interface AllocationBucket {
  type: InvestmentType;
  currentValue: number;
  investedAmount: number;
  percent: number;
}

/** Result of `GET /investments/summary`: the portfolio at a glance. */
export interface InvestmentSummary {
  holdingsCount: number;
  totalInvested: number;
  totalCurrentValue: number;
  totalGainLoss: number;
  gainLossPct: number;
  allocation: AllocationBucket[];
}

/**
 * Business logic for investments. Owner-scoped throughout. Per-holding gain/loss and
 * the portfolio summary (totals + allocation by asset class) are derived on read.
 */
export class InvestmentsService {
  private readonly logger = createLogger('InvestmentsService');

  constructor(private readonly repository: InvestmentsRepository) {}

  async create(userId: string, dto: CreateInvestmentInput): Promise<InvestmentResponse> {
    const currency = dto.currency?.toUpperCase() ?? (await this.resolveDefaultCurrency(userId));
    const investedAmount = toAmount(dto.investedAmount);

    const investment = await this.repository.create({
      userId: new Types.ObjectId(userId),
      name: dto.name,
      type: dto.type,
      investedAmount,
      currentValue: dto.currentValue !== undefined ? toAmount(dto.currentValue) : investedAmount,
      currency,
      quantity: dto.quantity,
      platform: dto.platform,
      notes: dto.notes,
      isActive: dto.isActive ?? true,
    });

    this.logger.info(`Investment created: ${investment._id.toString()} by user ${userId}`);
    return toInvestmentResponse(investment);
  }

  async findAll(
    userId: string,
    query: ListInvestmentsQuery,
  ): Promise<PaginatedData<InvestmentResponse>> {
    const filter: FilterQuery<InvestmentDocument> = { userId };
    if (query.type) {
      filter.type = query.type;
    }
    if (query.activeOnly) {
      filter.isActive = true;
    }

    const result = await this.repository.paginate({
      filter,
      page: query.page,
      limit: query.limit,
      sort: buildSort(query) ?? { createdAt: -1 },
    });

    return paginate(result.items.map(toInvestmentResponse), {
      page: result.page,
      limit: result.limit,
      totalItems: result.totalItems,
    });
  }

  async findById(userId: string, id: string): Promise<InvestmentResponse> {
    const investment = await this.repository.findOwnedByIdOrThrow(id, userId);
    return toInvestmentResponse(investment);
  }

  async update(
    userId: string,
    id: string,
    dto: UpdateInvestmentInput,
  ): Promise<InvestmentResponse> {
    const update: UpdateQuery<InvestmentDocument> = { ...dto };
    if (dto.investedAmount !== undefined) {
      update.investedAmount = toAmount(dto.investedAmount);
    }
    if (dto.currentValue !== undefined) {
      update.currentValue = toAmount(dto.currentValue);
    }
    if (dto.currency) {
      update.currency = dto.currency.toUpperCase();
    }

    const investment = await this.repository.updateOwned(id, userId, update);
    return toInvestmentResponse(investment);
  }

  async remove(userId: string, id: string): Promise<void> {
    await this.repository.deleteOwned(id, userId);
  }

  async summary(userId: string): Promise<InvestmentSummary> {
    const holdings = await this.repository.findActiveForUser(userId);

    const totalInvested = toAmount(holdings.reduce((sum, h) => sum + h.investedAmount, 0));
    const totalCurrentValue = toAmount(holdings.reduce((sum, h) => sum + h.currentValue, 0));
    const totalGainLoss = toAmount(totalCurrentValue - totalInvested);
    const gainLossPct = totalInvested > 0 ? toAmount((totalGainLoss / totalInvested) * 100) : 0;

    const byType = new Map<InvestmentType, { currentValue: number; investedAmount: number }>();
    for (const h of holdings) {
      const bucket = byType.get(h.type) ?? { currentValue: 0, investedAmount: 0 };
      bucket.currentValue = toAmount(bucket.currentValue + h.currentValue);
      bucket.investedAmount = toAmount(bucket.investedAmount + h.investedAmount);
      byType.set(h.type, bucket);
    }

    const allocation: AllocationBucket[] = [...byType.entries()]
      .map(([type, b]) => ({
        type,
        currentValue: b.currentValue,
        investedAmount: b.investedAmount,
        percent: totalCurrentValue > 0 ? toAmount((b.currentValue / totalCurrentValue) * 100) : 0,
      }))
      .sort((a, b) => b.currentValue - a.currentValue);

    return {
      holdingsCount: holdings.length,
      totalInvested,
      totalCurrentValue,
      totalGainLoss,
      gainLossPct,
      allocation,
    };
  }

  /** Falls back to the owner's configured default currency (then INR) when none is supplied. */
  private async resolveDefaultCurrency(userId: string): Promise<string> {
    const user = await usersService.findEntityById(userId);
    return user?.defaultCurrency ?? 'INR';
  }
}

/** Shared singleton instance used across the app. */
export const investmentsService = new InvestmentsService(investmentsRepository);
