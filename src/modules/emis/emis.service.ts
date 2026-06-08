import { type FilterQuery, Types, type UpdateQuery } from 'mongoose';
import { buildSort } from '../../common/utils/pagination';
import { paginate } from '../../common/utils/response';
import type { PaginatedData } from '../../common/types/api-response';
import { createLogger } from '../../logger';
import { usersService } from '../users/users.service';
import type { EmiType } from './emis.enums';
import { toEmiResponse, type EmiResponse } from './emi-response';
import type { EmiDocument } from './emis.model';
import { emisRepository, EmisRepository } from './emis.repository';
import type { CreateEmiInput, ListEmisQuery, UpdateEmiInput } from './emis.validation';

/** Money is stored to 2 decimal places — round once, at the boundary. */
const toAmount = (value: number): number => Math.round(value * 100) / 100;

interface EmiTypeBucket {
  type: EmiType;
  count: number;
  monthlyTotal: number;
}

/** Result of `GET /emis/summary`: the at-a-glance commitment view. */
export interface EmiSummary {
  activeCount: number;
  /** Sum of all ongoing obligations normalized to a monthly figure. */
  totalMonthlyCommitment: number;
  /** Remaining amount across finite (tenured) obligations — the outstanding liability. */
  totalOutstanding: number;
  /** Obligations whose next payment falls in the current calendar month. */
  dueThisMonth: { count: number; total: number };
  byType: EmiTypeBucket[];
}

/**
 * Business logic for recurring obligations. Owner-scoped throughout. Static facts
 * are stored; the live schedule (next due, paid/remaining, completion) and the
 * commitment summary are derived on read from the pure schedule helpers.
 */
export class EmisService {
  private readonly logger = createLogger('EmisService');

  constructor(private readonly repository: EmisRepository) {}

  async create(userId: string, dto: CreateEmiInput): Promise<EmiResponse> {
    const currency = dto.currency?.toUpperCase() ?? (await this.resolveDefaultCurrency(userId));

    const emi = await this.repository.create({
      userId: new Types.ObjectId(userId),
      name: dto.name,
      type: dto.type,
      amount: toAmount(dto.amount),
      currency,
      frequency: dto.frequency,
      startDate: dto.startDate,
      category: dto.category,
      paymentMethod: dto.paymentMethod,
      interestRatePct: dto.interestRatePct,
      principal: dto.principal !== undefined ? toAmount(dto.principal) : undefined,
      tenureCount: dto.tenureCount,
      autoDebit: dto.autoDebit ?? false,
      isActive: dto.isActive ?? true,
      notes: dto.notes,
    });

    this.logger.info(`EMI created: ${emi._id.toString()} by user ${userId}`);
    return toEmiResponse(emi, new Date());
  }

  async findAll(userId: string, query: ListEmisQuery): Promise<PaginatedData<EmiResponse>> {
    const filter: FilterQuery<EmiDocument> = { userId };
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

    const now = new Date();
    return paginate(
      result.items.map((emi) => toEmiResponse(emi, now)),
      { page: result.page, limit: result.limit, totalItems: result.totalItems },
    );
  }

  async findById(userId: string, id: string): Promise<EmiResponse> {
    const emi = await this.repository.findOwnedByIdOrThrow(id, userId);
    return toEmiResponse(emi, new Date());
  }

  async update(userId: string, id: string, dto: UpdateEmiInput): Promise<EmiResponse> {
    const update: UpdateQuery<EmiDocument> = { ...dto };
    if (dto.amount !== undefined) {
      update.amount = toAmount(dto.amount);
    }
    if (dto.principal !== undefined) {
      update.principal = toAmount(dto.principal);
    }
    if (dto.currency) {
      update.currency = dto.currency.toUpperCase();
    }

    const emi = await this.repository.updateOwned(id, userId, update);
    return toEmiResponse(emi, new Date());
  }

  async remove(userId: string, id: string): Promise<void> {
    await this.repository.deleteOwned(id, userId);
  }

  async summary(userId: string): Promise<EmiSummary> {
    const now = new Date();
    // Active obligations that still have payments left (completed loans are excluded).
    const ongoing = (await this.repository.findActiveForUser(userId))
      .map((emi) => toEmiResponse(emi, now))
      .filter((emi) => !emi.isCompleted);

    const totalMonthlyCommitment = toAmount(
      ongoing.reduce((sum, emi) => sum + emi.monthlyEquivalent, 0),
    );
    const totalOutstanding = toAmount(
      ongoing.reduce((sum, emi) => sum + (emi.remainingAmount ?? 0), 0),
    );

    const dueThisMonthList = ongoing.filter((emi) => emi.dueThisMonth);
    const dueThisMonth = {
      count: dueThisMonthList.length,
      total: toAmount(dueThisMonthList.reduce((sum, emi) => sum + emi.amount, 0)),
    };

    const byTypeMap = new Map<EmiType, EmiTypeBucket>();
    for (const emi of ongoing) {
      const bucket = byTypeMap.get(emi.type) ?? { type: emi.type, count: 0, monthlyTotal: 0 };
      bucket.count += 1;
      bucket.monthlyTotal = toAmount(bucket.monthlyTotal + emi.monthlyEquivalent);
      byTypeMap.set(emi.type, bucket);
    }

    return {
      activeCount: ongoing.length,
      totalMonthlyCommitment,
      totalOutstanding,
      dueThisMonth,
      byType: [...byTypeMap.values()].sort((a, b) => b.monthlyTotal - a.monthlyTotal),
    };
  }

  /** Falls back to the owner's configured default currency (then INR) when none is supplied. */
  private async resolveDefaultCurrency(userId: string): Promise<string> {
    const user = await usersService.findEntityById(userId);
    return user?.defaultCurrency ?? 'INR';
  }
}

/** Shared singleton instance used across the app. */
export const emisService = new EmisService(emisRepository);
