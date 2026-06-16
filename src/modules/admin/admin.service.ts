import type { FilterQuery } from 'mongoose';
import { Role } from '../../common/enums/role';
import { NotFoundException } from '../../common/errors/http-exception';
import { buildSort } from '../../common/utils/pagination';
import { paginate } from '../../common/utils/response';
import type { PaginatedData } from '../../common/types/api-response';
import {
  BudgetModel,
  CategoryModel,
  EmiModel,
  ExpenseModel,
  GoalModel,
  GroupExpenseModel,
  GroupModel,
  IncomeModel,
  InvestmentModel,
  NotificationModel,
  PushTokenModel,
  SettlementModel,
  UserModel,
  WaitlistEntryModel,
} from '../../database/models.registry';
import { cascadeDeleteUser, type CascadeResult } from '../users/user-cascade';
import { toUserResponse, type UserResponse } from '../users/user-response';
import type { UserDocument } from '../users/users.model';
import type {
  ListUsersQuery,
  ListWaitlistQuery,
  UpdateUserInput,
  UpdateWaitlistInput,
} from './admin.validation';

/** Escapes a user-supplied string for safe use inside a RegExp (search). */
const escapeRegex = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export interface AdminStats {
  users: { total: number; active: number; admins: number; new7d: number; new30d: number };
  content: {
    expenses: number;
    income: number;
    groups: number;
    groupExpenses: number;
    settlements: number;
    budgets: number;
    emis: number;
    goals: number;
    investments: number;
    notifications: number;
    pushTokens: number;
    categories: number;
  };
  waitlist: { total: number; invited: number; pending: number };
}

export interface TimeseriesPoint {
  /** ISO day, e.g. 2026-06-15. */
  date: string;
  users: number;
  waitlist: number;
}

export interface WaitlistResponse {
  id: string;
  email: string;
  source: string;
  invited: boolean;
  invitedAt: Date | null;
  createdAt: Date;
}

function toWaitlistResponse(e: {
  _id: { toString(): string };
  email: string;
  source: string;
  invitedAt?: Date | null;
  createdAt: Date;
}): WaitlistResponse {
  return {
    id: e._id.toString(),
    email: e.email,
    source: e.source,
    invited: Boolean(e.invitedAt),
    invitedAt: e.invitedAt ?? null,
    createdAt: e.createdAt,
  };
}

/**
 * Back-office operations behind `/admin` (all routes require the `admin` role).
 * Reads aggregate stats, manages user accounts, and curates the waitlist.
 * Category management reuses the existing `/categories` admin endpoints.
 */
class AdminService {
  async stats(): Promise<AdminStats> {
    const since = (days: number): Date => new Date(Date.now() - days * 86_400_000);

    const [
      total,
      active,
      admins,
      new7d,
      new30d,
      expenses,
      income,
      groups,
      groupExpenses,
      settlements,
      budgets,
      emis,
      goals,
      investments,
      notifications,
      pushTokens,
      categories,
      waitlistTotal,
      waitlistInvited,
    ] = await Promise.all([
      UserModel.countDocuments({}),
      UserModel.countDocuments({ isActive: true }),
      UserModel.countDocuments({ roles: Role.Admin }),
      UserModel.countDocuments({ createdAt: { $gte: since(7) } }),
      UserModel.countDocuments({ createdAt: { $gte: since(30) } }),
      ExpenseModel.countDocuments({}),
      IncomeModel.countDocuments({}),
      GroupModel.countDocuments({}),
      GroupExpenseModel.countDocuments({}),
      SettlementModel.countDocuments({}),
      BudgetModel.countDocuments({}),
      EmiModel.countDocuments({}),
      GoalModel.countDocuments({}),
      InvestmentModel.countDocuments({}),
      NotificationModel.countDocuments({}),
      PushTokenModel.countDocuments({}),
      CategoryModel.countDocuments({}),
      WaitlistEntryModel.countDocuments({}),
      WaitlistEntryModel.countDocuments({ invitedAt: { $ne: null } }),
    ]);

    return {
      users: { total, active, admins, new7d, new30d },
      content: {
        expenses,
        income,
        groups,
        groupExpenses,
        settlements,
        budgets,
        emis,
        goals,
        investments,
        notifications,
        pushTokens,
        categories,
      },
      waitlist: {
        total: waitlistTotal,
        invited: waitlistInvited,
        pending: waitlistTotal - waitlistInvited,
      },
    };
  }

  /** Daily new-user and waitlist counts for the last `days` days (gaps filled with 0). */
  async timeseries(days: number): Promise<TimeseriesPoint[]> {
    const DAY = 86_400_000;
    const start = new Date(Date.now() - (days - 1) * DAY);
    start.setUTCHours(0, 0, 0, 0);

    const pipeline = [
      { $match: { createdAt: { $gte: start } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: 'UTC' } },
          count: { $sum: 1 },
        },
      },
    ];

    const [users, waitlist] = await Promise.all([
      UserModel.aggregate<{ _id: string; count: number }>(pipeline),
      WaitlistEntryModel.aggregate<{ _id: string; count: number }>(pipeline),
    ]);

    const userMap = new Map(users.map((d) => [d._id, d.count]));
    const waitMap = new Map(waitlist.map((d) => [d._id, d.count]));

    const points: TimeseriesPoint[] = [];
    for (let i = 0; i < days; i++) {
      const key = new Date(start.getTime() + i * DAY).toISOString().slice(0, 10);
      points.push({ date: key, users: userMap.get(key) ?? 0, waitlist: waitMap.get(key) ?? 0 });
    }
    return points;
  }

  async listUsers(query: ListUsersQuery): Promise<PaginatedData<UserResponse>> {
    const filter: FilterQuery<UserDocument> = {};
    if (query.isActive !== undefined) filter.isActive = query.isActive;
    if (query.role) filter.roles = query.role;
    if (query.search) {
      const rx = new RegExp(escapeRegex(query.search), 'i');
      filter.$or = [{ firstName: rx }, { lastName: rx }, { phoneNumber: rx }, { email: rx }];
    }

    const sort = buildSort(query) ?? { createdAt: -1 };
    const [docs, totalItems] = await Promise.all([
      UserModel.find(filter)
        .sort(sort)
        .skip((query.page - 1) * query.limit)
        .limit(query.limit),
      UserModel.countDocuments(filter),
    ]);

    return paginate(docs.map(toUserResponse), {
      page: query.page,
      limit: query.limit,
      totalItems,
    });
  }

  async getUser(id: string): Promise<UserResponse> {
    const user = await UserModel.findById(id);
    if (!user) throw new NotFoundException('User not found');
    return toUserResponse(user);
  }

  async updateUser(id: string, body: UpdateUserInput): Promise<UserResponse> {
    const user = await UserModel.findById(id);
    if (!user) throw new NotFoundException('User not found');
    if (body.isActive !== undefined) user.isActive = body.isActive;
    if (body.roles) user.roles = body.roles;
    await user.save();
    return toUserResponse(user);
  }

  async deleteUser(id: string): Promise<CascadeResult> {
    const user = await UserModel.findById(id);
    if (!user) throw new NotFoundException('User not found');
    return cascadeDeleteUser(user, { apply: true });
  }

  async listWaitlist(query: ListWaitlistQuery): Promise<PaginatedData<WaitlistResponse>> {
    const filter: FilterQuery<{ invitedAt?: Date | null; email: string }> = {};
    if (query.invited !== undefined) filter.invitedAt = query.invited ? { $ne: null } : null;
    if (query.search) filter.email = new RegExp(escapeRegex(query.search), 'i');

    const sort = buildSort(query) ?? { createdAt: -1 };
    const [docs, totalItems] = await Promise.all([
      WaitlistEntryModel.find(filter)
        .sort(sort)
        .skip((query.page - 1) * query.limit)
        .limit(query.limit)
        .lean(),
      WaitlistEntryModel.countDocuments(filter),
    ]);

    return paginate(docs.map(toWaitlistResponse), {
      page: query.page,
      limit: query.limit,
      totalItems,
    });
  }

  async updateWaitlist(id: string, body: UpdateWaitlistInput): Promise<WaitlistResponse> {
    const entry = await WaitlistEntryModel.findById(id);
    if (!entry) throw new NotFoundException('Waitlist entry not found');
    entry.invitedAt = body.invited ? new Date() : undefined;
    await entry.save();
    return toWaitlistResponse(entry);
  }

  async deleteWaitlist(id: string): Promise<void> {
    const deleted = await WaitlistEntryModel.findByIdAndDelete(id);
    if (!deleted) throw new NotFoundException('Waitlist entry not found');
  }
}

export const adminService = new AdminService();
