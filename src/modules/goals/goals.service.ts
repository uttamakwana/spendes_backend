import { type FilterQuery, Types, type UpdateQuery } from 'mongoose';
import { buildSort } from '../../common/utils/pagination';
import { paginate } from '../../common/utils/response';
import type { PaginatedData } from '../../common/types/api-response';
import { createLogger } from '../../logger';
import { usersService } from '../users/users.service';
import { toGoalResponse, type GoalResponse } from './goal-response';
import type { GoalDocument } from './goals.model';
import { goalsRepository, GoalsRepository } from './goals.repository';
import type {
  ContributeGoalInput,
  CreateGoalInput,
  ListGoalsQuery,
  UpdateGoalInput,
} from './goals.validation';

/** Money is stored to 2 decimal places — round once, at the boundary. */
const toAmount = (value: number): number => Math.round(value * 100) / 100;

/**
 * Business logic for savings goals. Owner-scoped throughout. Progress and the
 * "save ₹X/month" guidance are derived on read; `currentAmount` is kept in sync with
 * contributions by an atomic update in the repository.
 */
export class GoalsService {
  private readonly logger = createLogger('GoalsService');

  constructor(private readonly repository: GoalsRepository) {}

  async create(userId: string, dto: CreateGoalInput): Promise<GoalResponse> {
    const currency = dto.currency?.toUpperCase() ?? (await this.resolveDefaultCurrency(userId));

    const goal = await this.repository.create({
      userId: new Types.ObjectId(userId),
      name: dto.name,
      targetAmount: toAmount(dto.targetAmount),
      currentAmount: dto.currentAmount !== undefined ? toAmount(dto.currentAmount) : 0,
      currency,
      targetDate: dto.targetDate,
      icon: dto.icon,
      color: dto.color,
      notes: dto.notes,
      contributions: [],
      isActive: true,
    });

    this.logger.info(`Goal created: ${goal._id.toString()} by user ${userId}`);
    return toGoalResponse(goal, new Date());
  }

  async findAll(userId: string, query: ListGoalsQuery): Promise<PaginatedData<GoalResponse>> {
    const filter: FilterQuery<GoalDocument> = { userId };
    if (query.activeOnly) {
      filter.isActive = true;
    }

    const result = await this.repository.paginate({
      filter,
      page: query.page,
      limit: query.limit,
      sort: buildSort(query) ?? { createdAt: -1 },
    });

    const now = new Date();
    return paginate(
      result.items.map((goal) => toGoalResponse(goal, now)),
      { page: result.page, limit: result.limit, totalItems: result.totalItems },
    );
  }

  async findById(userId: string, id: string): Promise<GoalResponse> {
    const goal = await this.repository.findOwnedByIdOrThrow(id, userId);
    return toGoalResponse(goal, new Date());
  }

  async update(userId: string, id: string, dto: UpdateGoalInput): Promise<GoalResponse> {
    const update: UpdateQuery<GoalDocument> = { ...dto };
    if (dto.targetAmount !== undefined) {
      update.targetAmount = toAmount(dto.targetAmount);
    }
    if (dto.currency) {
      update.currency = dto.currency.toUpperCase();
    }

    const goal = await this.repository.updateOwned(id, userId, update);
    return toGoalResponse(goal, new Date());
  }

  async remove(userId: string, id: string): Promise<void> {
    await this.repository.deleteOwned(id, userId);
  }

  async contribute(userId: string, id: string, dto: ContributeGoalInput): Promise<GoalResponse> {
    const contribution = {
      _id: new Types.ObjectId(),
      amount: toAmount(dto.amount),
      note: dto.note,
      contributedAt: dto.contributedAt ?? new Date(),
    };
    const goal = await this.repository.addContribution(id, userId, contribution);
    this.logger.info(`Goal contribution: ${id} +${contribution.amount} by user ${userId}`);
    return toGoalResponse(goal, new Date());
  }

  /** Falls back to the owner's configured default currency (then INR) when none is supplied. */
  private async resolveDefaultCurrency(userId: string): Promise<string> {
    const user = await usersService.findEntityById(userId);
    return user?.defaultCurrency ?? 'INR';
  }
}

/** Shared singleton instance used across the app. */
export const goalsService = new GoalsService(goalsRepository);
