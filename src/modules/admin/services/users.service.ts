import type { Request } from 'express';
import type { FilterQuery } from 'mongoose';
import { ExpenseSource } from '../../../common/enums/expense-source';
import { Role } from '../../../common/enums/role';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '../../../common/errors/http-exception';
import type { PaginatedData } from '../../../common/types/api-response';
import { paginate } from '../../../common/utils/response';
import {
  BudgetModel,
  EmiModel,
  ExpenseModel,
  GoalModel,
  GroupExpenseModel,
  GroupModel,
  IncomeModel,
  InsightModel,
  InvestmentModel,
  NotificationModel,
  PushTokenModel,
  SettlementModel,
  UserModel,
} from '../../../database/models.registry';
import { AuthEventModel, AuthEventType } from '../../auth/auth-event.model';
import { authEventsService } from '../../auth/auth-events.service';
import { GroupKind, GroupMemberStatus } from '../../groups/groups.enums';
import { cascadeDeleteUser, type CascadeResult } from '../../users/user-cascade';
import { toUserResponse, type UserResponse } from '../../users/user-response';
import type { UserDocument } from '../../users/users.model';
import { usersService } from '../../users/users.service';
import {
  byCurrencyStage,
  daysAgo,
  dateRange,
  escapeRegex,
  toCurrencyTotals,
  withId,
  type CurrencyTotal,
} from '../admin.helpers';
import type { ListUsersQuery, NotifyUserInput, UpdateUserInput } from '../admin.validation';
import { auditService, diff } from '../audit/audit.service';
import { adminEngagementService } from './engagement.service';

export interface AdminUserRow extends UserResponse {
  /** Whether a refresh token is currently stored (i.e. the user has a live session). */
  hasSession: boolean;
}

export interface UserGroupSummary {
  id: string;
  name: string;
  kind: GroupKind;
  currency: string;
  isActive: boolean;
  memberCount: number;
  role: string;
  status: string;
  isOwner: boolean;
}

export interface UserOverview {
  user: AdminUserRow;
  counts: {
    expenses: number;
    personalExpenses: number;
    income: number;
    groups: number;
    friends: number;
    groupExpensesAuthored: number;
    settlementsAuthored: number;
    budgets: number;
    emis: number;
    goals: number;
    investments: number;
    notifications: number;
    unreadNotifications: number;
    disputesRaised: number;
    devices: number;
    insights: number;
  };
  money: {
    spend30d: CurrencyTotal[];
    income30d: CurrencyTotal[];
    spendLifetime: CurrencyTotal[];
    incomeLifetime: CurrencyTotal[];
  };
  groups: UserGroupSummary[];
  devices: {
    id: string;
    platform: string;
    tokenPreview: string;
    createdAt: Date;
    updatedAt: Date;
  }[];
  recentAuth: Record<string, unknown>[];
}

const describe = (u: Pick<UserDocument, 'firstName' | 'lastName' | 'dialCode' | 'phoneNumber'>) =>
  `${u.firstName} ${u.lastName}`.trim() + ` (${u.dialCode}${u.phoneNumber})`;

/** The editable slice of a user, used to compute audit diffs. */
const snapshot = (u: UserDocument): Record<string, unknown> => ({
  isActive: u.isActive,
  roles: [...u.roles],
  plan: u.plan,
  firstName: u.firstName,
  lastName: u.lastName,
  email: u.email ?? null,
});

/** User administration: search, 360° view, access control, sessions, deletion. */
class AdminUsersService {
  async list(query: ListUsersQuery): Promise<PaginatedData<AdminUserRow>> {
    const filter: FilterQuery<UserDocument> = {};
    if (query.isActive !== undefined) filter.isActive = query.isActive;
    if (query.role) filter.roles = query.role;
    if (query.plan) filter.plan = query.plan;
    if (query.country) filter.country = query.country;
    const joined = dateRange(query.joinedFrom, query.joinedTo);
    if (joined) filter.createdAt = joined;
    if (query.search) {
      const rx = new RegExp(escapeRegex(query.search), 'i');
      const digits = query.search.replace(/\D/g, '');
      filter.$or = [
        { firstName: rx },
        { lastName: rx },
        { email: rx },
        ...(digits ? [{ phoneNumber: new RegExp(escapeRegex(digits)) }] : []),
      ];
      // "Asha Patel" should match first + last name together.
      const [first, ...rest] = query.search.trim().split(/\s+/);
      if (rest.length) {
        filter.$or.push({
          firstName: new RegExp(`^${escapeRegex(first)}`, 'i'),
          lastName: new RegExp(`^${escapeRegex(rest.join(' '))}`, 'i'),
        });
      }
    }

    const sortField = query.sortBy ?? 'createdAt';
    const [docs, totalItems] = await Promise.all([
      UserModel.find(filter)
        .select('+refreshTokenHash')
        .sort({ [sortField]: query.sortOrder === 'asc' ? 1 : -1, _id: -1 })
        .skip((query.page - 1) * query.limit)
        .limit(query.limit),
      UserModel.countDocuments(filter),
    ]);

    return paginate(
      docs.map((d) => this.toRow(d)),
      {
        page: query.page,
        limit: query.limit,
        totalItems,
      },
    );
  }

  async get(id: string): Promise<AdminUserRow> {
    return this.toRow(await this.load(id));
  }

  async overview(id: string): Promise<UserOverview> {
    const user = await this.load(id);
    const userId = user._id;
    const d30 = daysAgo(30);

    const [
      expenses,
      personalExpenses,
      income,
      groups,
      friends,
      groupExpensesAuthored,
      settlementsAuthored,
      budgets,
      emis,
      goals,
      investments,
      notifications,
      unreadNotifications,
      disputesRaised,
      insights,
    ] = await Promise.all([
      ExpenseModel.countDocuments({ userId }),
      ExpenseModel.countDocuments({ userId, source: ExpenseSource.Personal }),
      IncomeModel.countDocuments({ userId }),
      GroupModel.countDocuments({ 'members.userId': userId, kind: { $ne: GroupKind.Direct } }),
      GroupModel.countDocuments({ 'members.userId': userId, kind: GroupKind.Direct }),
      GroupExpenseModel.countDocuments({ createdByUserId: userId }),
      SettlementModel.countDocuments({ createdByUserId: userId }),
      BudgetModel.countDocuments({ userId }),
      EmiModel.countDocuments({ userId }),
      GoalModel.countDocuments({ userId }),
      InvestmentModel.countDocuments({ userId }),
      NotificationModel.countDocuments({ userId }),
      NotificationModel.countDocuments({ userId, isRead: false }),
      NotificationModel.countDocuments({ userId, isDisputed: true }),
      InsightModel.countDocuments({ userId }),
    ]);

    const money = async (
      model: typeof ExpenseModel | typeof IncomeModel,
      dateField: string,
      since?: Date,
    ) =>
      toCurrencyTotals(
        await (model as typeof ExpenseModel).aggregate([
          { $match: { userId, ...(since ? { [dateField]: { $gte: since } } : {}) } },
          byCurrencyStage(),
        ]),
      );

    const [spend30d, income30d, spendLifetime, incomeLifetime, groupDocs, devices, recentAuth] =
      await Promise.all([
        money(ExpenseModel, 'spentAt', d30),
        money(IncomeModel, 'receivedAt', d30),
        money(ExpenseModel, 'spentAt'),
        money(IncomeModel, 'receivedAt'),
        GroupModel.find({ 'members.userId': userId })
          .select('name kind currency isActive members createdBy')
          .sort({ updatedAt: -1 })
          .limit(100)
          .lean(),
        PushTokenModel.find({ userId }).sort({ updatedAt: -1 }).lean(),
        AuthEventModel.find({ userId }).sort({ createdAt: -1 }).limit(15).lean(),
      ]);

    const uid = userId.toString();
    return {
      user: this.toRow(user),
      counts: {
        expenses,
        personalExpenses,
        income,
        groups,
        friends,
        groupExpensesAuthored,
        settlementsAuthored,
        budgets,
        emis,
        goals,
        investments,
        notifications,
        unreadNotifications,
        disputesRaised,
        devices: devices.length,
        insights,
      },
      money: { spend30d, income30d, spendLifetime, incomeLifetime },
      groups: groupDocs.map((g) => {
        const me = g.members.find((m) => m.userId?.toString() === uid);
        return {
          id: g._id.toString(),
          name: g.name,
          kind: g.kind ?? GroupKind.Standard,
          currency: g.currency,
          isActive: g.isActive,
          memberCount: g.members.filter((m) => m.status !== GroupMemberStatus.Removed).length,
          role: me?.role ?? 'member',
          status: me?.status ?? 'active',
          isOwner: g.createdBy.toString() === uid,
        };
      }),
      devices: devices.map((d) => ({
        id: d._id.toString(),
        platform: d.platform,
        tokenPreview: `${d.token.slice(0, 22)}…`,
        createdAt: d.createdAt,
        updatedAt: d.updatedAt,
      })),
      recentAuth: recentAuth.map(withId),
    };
  }

  async update(req: Request, id: string, body: UpdateUserInput): Promise<AdminUserRow> {
    const user = await this.load(id);
    const isSelf = req.user!.id === id;
    const wasAdmin = user.roles.includes(Role.Admin);

    if (isSelf && body.isActive === false) {
      throw new BadRequestException('You cannot deactivate your own account');
    }
    if (isSelf && body.roles && !body.roles.includes(Role.Admin)) {
      throw new BadRequestException('You cannot remove your own admin access');
    }
    const losesAdmin =
      wasAdmin &&
      ((body.roles && !body.roles.includes(Role.Admin)) ||
        (body.isActive === false && user.isActive));
    if (losesAdmin) {
      const activeAdmins = await UserModel.countDocuments({ roles: Role.Admin, isActive: true });
      if (activeAdmins <= 1) {
        throw new BadRequestException('This is the last active admin — promote someone else first');
      }
    }

    const before = snapshot(user);
    if (body.isActive !== undefined) user.isActive = body.isActive;
    if (body.roles) user.roles = [...new Set(body.roles)];
    if (body.plan) user.plan = body.plan;
    if (body.firstName) user.firstName = body.firstName;
    if (body.lastName) user.lastName = body.lastName;
    if (body.email !== undefined) {
      user.email = body.email ?? undefined;
      if (!body.email) user.isEmailVerified = false;
    }
    // Deactivation also kills the refresh token so the device can't silently renew.
    if (body.isActive === false) user.refreshTokenHash = undefined;

    try {
      await user.save();
    } catch (error) {
      if ((error as { code?: number }).code === 11000) {
        throw new ConflictException('That email is already used by another account');
      }
      throw error;
    }

    const changes = diff(before, snapshot(user));
    await auditService.record(req, {
      action: 'user.update',
      targetType: 'user',
      targetId: id,
      summary: `Updated ${describe(user)}: ${Object.keys(changes.after).join(', ') || 'no changes'}`,
      ...changes,
    });
    return this.toRow(user);
  }

  /** Signs the user out everywhere: their refresh token is discarded. */
  async revokeSessions(req: Request, id: string): Promise<{ revoked: boolean }> {
    const user = await this.load(id);
    await usersService.setRefreshTokenHash(id, null);
    authEventsService.record(req, {
      type: AuthEventType.SessionRevoked,
      success: true,
      userId: id,
      dialCode: user.dialCode,
      phoneNumber: user.phoneNumber,
      reason: `Revoked by admin ${req.user!.id}`,
    });
    await auditService.record(req, {
      action: 'user.revoke_sessions',
      targetType: 'user',
      targetId: id,
      summary: `Signed out ${describe(user)} on all devices`,
    });
    return { revoked: true };
  }

  /** Dry run of the cascade delete — what WOULD be removed. */
  async deletePreview(id: string): Promise<CascadeResult> {
    const user = await this.load(id);
    return cascadeDeleteUser(user, { apply: false });
  }

  async remove(req: Request, id: string): Promise<CascadeResult> {
    if (req.user!.id === id) throw new BadRequestException('You cannot delete your own account');
    const user = await this.load(id);
    if (user.roles.includes(Role.Admin)) {
      const admins = await UserModel.countDocuments({ roles: Role.Admin });
      if (admins <= 1) throw new BadRequestException('Cannot delete the last admin');
    }
    const result = await cascadeDeleteUser(user, { apply: true });
    await auditService.record(req, {
      action: 'user.delete',
      targetType: 'user',
      targetId: id,
      summary: `Deleted ${describe(user)} and ${result.total - 1} related record(s)`,
      meta: { steps: result.steps },
    });
    return result;
  }

  async notify(req: Request, id: string, body: NotifyUserInput) {
    const user = await this.load(id);
    const result = await adminEngagementService.deliverAnnouncement(
      [user._id],
      body.title,
      body.body,
      body.channel,
    );
    await auditService.record(req, {
      action: 'user.notify',
      targetType: 'user',
      targetId: id,
      summary: `Sent "${body.title}" to ${describe(user)}`,
      meta: { ...body, ...result },
    });
    return result;
  }

  /**
   * Everything stored about one user, as JSON — for data-access / portability
   * requests. Secrets (refresh-token hash, OTP hashes) are never included.
   */
  async exportData(req: Request, id: string): Promise<Record<string, unknown>> {
    const user = await this.load(id);
    const userId = user._id;
    const [
      expenses,
      income,
      budgets,
      emis,
      goals,
      investments,
      notifications,
      devices,
      insights,
      groups,
    ] = await Promise.all([
      ExpenseModel.find({ userId }).lean(),
      IncomeModel.find({ userId }).lean(),
      BudgetModel.find({ userId }).lean(),
      EmiModel.find({ userId }).lean(),
      GoalModel.find({ userId }).lean(),
      InvestmentModel.find({ userId }).lean(),
      NotificationModel.find({ userId }).lean(),
      PushTokenModel.find({ userId }).select('platform createdAt updatedAt').lean(),
      InsightModel.find({ userId }).lean(),
      GroupModel.find({ 'members.userId': userId }).lean(),
    ]);
    const groupIds = groups.map((g) => g._id);
    const [groupExpenses, settlements] = await Promise.all([
      GroupExpenseModel.find({ groupId: { $in: groupIds } }).lean(),
      SettlementModel.find({ groupId: { $in: groupIds } }).lean(),
    ]);

    await auditService.record(req, {
      action: 'user.export',
      targetType: 'user',
      targetId: id,
      summary: `Exported all data for ${describe(user)}`,
    });

    return {
      exportedAt: new Date(),
      profile: toUserResponse(user),
      expenses,
      income,
      budgets,
      emis,
      goals,
      investments,
      groups,
      groupExpenses,
      settlements,
      notifications,
      devices,
      insights,
    };
  }

  private async load(id: string): Promise<UserDocument & { save(): Promise<unknown> }> {
    const user = await UserModel.findById(id).select('+refreshTokenHash');
    if (!user) throw new NotFoundException('User not found');
    return user as unknown as UserDocument & { save(): Promise<unknown> };
  }

  private toRow(user: UserDocument): AdminUserRow {
    return { ...toUserResponse(user), hasSession: Boolean(user.refreshTokenHash) };
  }
}

export const adminUsersService = new AdminUsersService();
