import { type FilterQuery, Types, type UpdateQuery } from 'mongoose';
import { buildSort } from '../../common/utils/pagination';
import { paginate } from '../../common/utils/response';
import type { PaginatedData } from '../../common/types/api-response';
import { createLogger } from '../../logger';
import { expensesService } from '../expenses/expenses.service';
import { usersService } from '../users/users.service';
import { resolvePeriodWindow } from './budget-period.util';
import { toBudgetResponse, type BudgetResponse } from './budget-response';
import type { BudgetDocument } from './budgets.model';
import { budgetsRepository, BudgetsRepository } from './budgets.repository';
import type { CreateBudgetInput, ListBudgetsQuery, UpdateBudgetInput } from './budgets.validation';

/** Money is stored to 2 decimal places — round once, at the boundary. */
const toAmount = (value: number): number => Math.round(value * 100) / 100;

/**
 * Business logic for budgets. Every method is scoped to the owning `userId`. A
 * budget stores only its limit + period; "spent" is computed on read from the
 * user's expenses in the active window (which already include materialized
 * group/friend shares), so the figures are always live with no write-time
 * bookkeeping. The current date is resolved per request and passed to the pure
 * window calculator.
 */
export class BudgetsService {
  private readonly logger = createLogger('BudgetsService');

  constructor(private readonly repository: BudgetsRepository) {}

  async create(userId: string, dto: CreateBudgetInput): Promise<BudgetResponse> {
    const currency = dto.currency?.toUpperCase() ?? (await this.resolveDefaultCurrency(userId));

    const budget = await this.repository.create({
      userId: new Types.ObjectId(userId),
      name: dto.name,
      category: dto.category,
      amount: toAmount(dto.amount),
      currency,
      period: dto.period,
      startDate: dto.startDate,
      endDate: dto.endDate,
      alertThresholdPct: dto.alertThresholdPct ?? 80,
      isActive: dto.isActive ?? true,
    });

    this.logger.info(`Budget created: ${budget._id.toString()} by user ${userId}`);
    return this.computeResponse(userId, budget);
  }

  async findAll(userId: string, query: ListBudgetsQuery): Promise<PaginatedData<BudgetResponse>> {
    const filter: FilterQuery<BudgetDocument> = { userId };
    if (query.period) {
      filter.period = query.period;
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

    const items = await Promise.all(
      result.items.map((budget) => this.computeResponse(userId, budget)),
    );

    return paginate(items, {
      page: result.page,
      limit: result.limit,
      totalItems: result.totalItems,
    });
  }

  async findById(userId: string, id: string): Promise<BudgetResponse> {
    const budget = await this.repository.findOwnedByIdOrThrow(id, userId);
    return this.computeResponse(userId, budget);
  }

  async update(userId: string, id: string, dto: UpdateBudgetInput): Promise<BudgetResponse> {
    const update: UpdateQuery<BudgetDocument> = { ...dto };
    if (dto.amount !== undefined) {
      update.amount = toAmount(dto.amount);
    }
    if (dto.currency) {
      update.currency = dto.currency.toUpperCase();
    }

    const budget = await this.repository.updateOwned(id, userId, update);
    return this.computeResponse(userId, budget);
  }

  async remove(userId: string, id: string): Promise<void> {
    await this.repository.deleteOwned(id, userId);
  }

  /** Resolves the active window and live spend for a budget, then maps to the response. */
  private async computeResponse(userId: string, budget: BudgetDocument): Promise<BudgetResponse> {
    const window = resolvePeriodWindow(budget.period, new Date(), budget.startDate, budget.endDate);
    const spent = await expensesService.sumForPeriod(userId, window, budget.category);
    return toBudgetResponse(budget, window, spent);
  }

  /** Falls back to the owner's configured default currency (then INR) when none is supplied. */
  private async resolveDefaultCurrency(userId: string): Promise<string> {
    const user = await usersService.findEntityById(userId);
    return user?.defaultCurrency ?? 'INR';
  }
}

/** Shared singleton instance used across the app. */
export const budgetsService = new BudgetsService(budgetsRepository);
