import type { Model, PipelineStage } from 'mongoose';
import { ExpenseSource } from '../../../common/enums/expense-source';
import { PlanType } from '../../../common/enums/plan-type';
import { Role } from '../../../common/enums/role';
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
} from '../../../database/models.registry';
import { InsightModel } from '../../ai/insight.model';
import { AuthEventModel, AuthEventType } from '../../auth/auth-event.model';
import { GroupKind, GroupMemberStatus } from '../../groups/groups.enums';
import { DevicePlatform } from '../../push/push.enums';
import { byCurrencyStage, daysAgo, toCurrencyTotals, type CurrencyTotal } from '../admin.helpers';

export interface KeyCount {
  key: string;
  count: number;
}

export interface AdminOverview {
  generatedAt: Date;
  users: {
    total: number;
    active: number;
    inactive: number;
    admins: number;
    pro: number;
    new24h: number;
    new7d: number;
    new30d: number;
    /** Distinct users who signed in within the window (by `lastLoginAt`). */
    dau: number;
    wau: number;
    mau: number;
  };
  engagement: {
    /** Users who logged at least one personal expense in the last 30 days. */
    activeSpenders30d: number;
    expenses30d: number;
    income30d: number;
    groupExpenses30d: number;
    settlements30d: number;
  };
  volume30d: {
    expenses: CurrencyTotal[];
    income: CurrencyTotal[];
    groupExpenses: CurrencyTotal[];
    settlements: CurrencyTotal[];
  };
  content: {
    expenses: number;
    income: number;
    groups: number;
    friendships: number;
    groupExpenses: number;
    settlements: number;
    budgets: number;
    emis: number;
    goals: number;
    investments: number;
    notifications: number;
    insights: number;
    categories: number;
  };
  social: {
    pendingInvites: number;
    openDisputes: number;
    archivedGroups: number;
  };
  devices: { total: number; ios: number; android: number; usersWithPush: number };
  auth24h: { otpRequests: number; logins: number; registrations: number; failures: number };
  waitlist: { total: number; invited: number; pending: number };
}

export interface AdminBreakdowns {
  usersByCountry: KeyCount[];
  usersByPlan: KeyCount[];
  topExpenseCategories30d: (KeyCount & { users: number })[];
  paymentMethods30d: KeyCount[];
  splitStrategies: KeyCount[];
  notificationTypes30d: KeyCount[];
}

export interface TimeseriesPoint {
  /** ISO day, e.g. 2026-06-15. */
  date: string;
  users: number;
  waitlist: number;
  expenses: number;
  income: number;
  groupExpenses: number;
  settlements: number;
  logins: number;
}

const countBy = async <T>(
  model: Model<T>,
  field: string,
  match: Record<string, unknown> = {},
  limit = 20,
): Promise<KeyCount[]> => {
  const rows = await model.aggregate<{ _id: string | null; count: number }>([
    { $match: match },
    { $group: { _id: `$${field}`, count: { $sum: 1 } } },
    { $sort: { count: -1 } },
    { $limit: limit },
  ]);
  return rows.map((r) => ({ key: r._id ?? 'unknown', count: r.count }));
};

const volume = async <T>(model: Model<T>, dateField: string, since: Date) =>
  toCurrencyTotals(
    await model.aggregate([{ $match: { [dateField]: { $gte: since } } }, byCurrencyStage()]),
  );

/** Dashboard-level aggregates across every module. Read-only. */
class AdminStatsService {
  async overview(): Promise<AdminOverview> {
    const d1 = daysAgo(1);
    const d7 = daysAgo(7);
    const d30 = daysAgo(30);

    const [
      total,
      active,
      admins,
      pro,
      new24h,
      new7d,
      new30d,
      dau,
      wau,
      mau,
      activeSpenders,
      expenses30d,
      income30d,
      groupExpenses30d,
      settlements30d,
    ] = await Promise.all([
      UserModel.countDocuments({}),
      UserModel.countDocuments({ isActive: true }),
      UserModel.countDocuments({ roles: Role.Admin }),
      UserModel.countDocuments({ plan: PlanType.Pro }),
      UserModel.countDocuments({ createdAt: { $gte: d1 } }),
      UserModel.countDocuments({ createdAt: { $gte: d7 } }),
      UserModel.countDocuments({ createdAt: { $gte: d30 } }),
      UserModel.countDocuments({ lastLoginAt: { $gte: d1 } }),
      UserModel.countDocuments({ lastLoginAt: { $gte: d7 } }),
      UserModel.countDocuments({ lastLoginAt: { $gte: d30 } }),
      ExpenseModel.distinct('userId', { createdAt: { $gte: d30 }, source: ExpenseSource.Personal }),
      ExpenseModel.countDocuments({ createdAt: { $gte: d30 } }),
      IncomeModel.countDocuments({ createdAt: { $gte: d30 } }),
      GroupExpenseModel.countDocuments({ createdAt: { $gte: d30 } }),
      SettlementModel.countDocuments({ createdAt: { $gte: d30 } }),
    ]);

    const [volExpenses, volIncome, volGroup, volSettle] = await Promise.all([
      volume(ExpenseModel, 'spentAt', d30),
      volume(IncomeModel, 'receivedAt', d30),
      volume(GroupExpenseModel, 'spentAt', d30),
      volume(SettlementModel, 'settledAt', d30),
    ]);

    const [
      expenses,
      income,
      groups,
      friendships,
      groupExpenses,
      settlements,
      budgets,
      emis,
      goals,
      investments,
      notifications,
      insights,
      categories,
      pendingInvites,
      openDisputes,
      archivedGroups,
    ] = await Promise.all([
      ExpenseModel.estimatedDocumentCount(),
      IncomeModel.estimatedDocumentCount(),
      GroupModel.countDocuments({ kind: { $ne: GroupKind.Direct } }),
      GroupModel.countDocuments({ kind: GroupKind.Direct }),
      GroupExpenseModel.estimatedDocumentCount(),
      SettlementModel.estimatedDocumentCount(),
      BudgetModel.estimatedDocumentCount(),
      EmiModel.estimatedDocumentCount(),
      GoalModel.estimatedDocumentCount(),
      InvestmentModel.estimatedDocumentCount(),
      NotificationModel.estimatedDocumentCount(),
      InsightModel.estimatedDocumentCount(),
      CategoryModel.estimatedDocumentCount(),
      GroupModel.aggregate<{ n: number }>([
        { $unwind: '$members' },
        { $match: { 'members.status': GroupMemberStatus.Invited } },
        { $count: 'n' },
      ]).then((r) => r[0]?.n ?? 0),
      NotificationModel.countDocuments({ isDisputed: true }),
      GroupModel.countDocuments({ isActive: false }),
    ]);

    const [devicesTotal, ios, android, usersWithPush] = await Promise.all([
      PushTokenModel.estimatedDocumentCount(),
      PushTokenModel.countDocuments({ platform: DevicePlatform.Ios }),
      PushTokenModel.countDocuments({ platform: DevicePlatform.Android }),
      PushTokenModel.distinct('userId').then((ids) => ids.length),
    ]);

    const [otpRequests, logins, registrations, failures] = await Promise.all([
      AuthEventModel.countDocuments({ type: AuthEventType.OtpRequested, createdAt: { $gte: d1 } }),
      AuthEventModel.countDocuments({
        type: AuthEventType.Login,
        success: true,
        createdAt: { $gte: d1 },
      }),
      AuthEventModel.countDocuments({
        type: AuthEventType.Register,
        success: true,
        createdAt: { $gte: d1 },
      }),
      AuthEventModel.countDocuments({ success: false, createdAt: { $gte: d1 } }),
    ]);

    const [waitlistTotal, waitlistInvited] = await Promise.all([
      WaitlistEntryModel.countDocuments({}),
      WaitlistEntryModel.countDocuments({ invitedAt: { $ne: null } }),
    ]);

    return {
      generatedAt: new Date(),
      users: {
        total,
        active,
        inactive: total - active,
        admins,
        pro,
        new24h,
        new7d,
        new30d,
        dau,
        wau,
        mau,
      },
      engagement: {
        activeSpenders30d: activeSpenders.length,
        expenses30d,
        income30d,
        groupExpenses30d,
        settlements30d,
      },
      volume30d: {
        expenses: volExpenses,
        income: volIncome,
        groupExpenses: volGroup,
        settlements: volSettle,
      },
      content: {
        expenses,
        income,
        groups,
        friendships,
        groupExpenses,
        settlements,
        budgets,
        emis,
        goals,
        investments,
        notifications,
        insights,
        categories,
      },
      social: { pendingInvites, openDisputes, archivedGroups },
      devices: { total: devicesTotal, ios, android, usersWithPush },
      auth24h: { otpRequests, logins, registrations, failures },
      waitlist: {
        total: waitlistTotal,
        invited: waitlistInvited,
        pending: waitlistTotal - waitlistInvited,
      },
    };
  }

  async breakdowns(): Promise<AdminBreakdowns> {
    const d30 = daysAgo(30);
    const [
      usersByCountry,
      usersByPlan,
      topCategories,
      paymentMethods30d,
      splitStrategies,
      notificationTypes30d,
    ] = await Promise.all([
      countBy(UserModel, 'country'),
      countBy(UserModel, 'plan'),
      ExpenseModel.aggregate<{ _id: string; count: number; users: string[] }>([
        { $match: { spentAt: { $gte: d30 } } },
        { $group: { _id: '$category', count: { $sum: 1 }, users: { $addToSet: '$userId' } } },
        { $sort: { count: -1 } },
        { $limit: 10 },
      ]),
      countBy(ExpenseModel, 'paymentMethod', {
        spentAt: { $gte: d30 },
        source: ExpenseSource.Personal,
      }),
      countBy(GroupExpenseModel, 'splitStrategy'),
      countBy(NotificationModel, 'type', { createdAt: { $gte: d30 } }),
    ]);

    return {
      usersByCountry,
      usersByPlan,
      topExpenseCategories30d: topCategories.map((c) => ({
        key: c._id,
        count: c.count,
        users: c.users.length,
      })),
      paymentMethods30d,
      splitStrategies,
      notificationTypes30d,
    };
  }

  /** Daily activity counts for the last `days` days (UTC days, gaps filled with 0). */
  async timeseries(days: number): Promise<TimeseriesPoint[]> {
    const DAY = 86_400_000;
    const start = new Date(Date.now() - (days - 1) * DAY);
    start.setUTCHours(0, 0, 0, 0);

    const perDay = (match: Record<string, unknown> = {}): PipelineStage[] => [
      { $match: { createdAt: { $gte: start }, ...match } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: 'UTC' } },
          count: { $sum: 1 },
        },
      },
    ];

    type Row = { _id: string; count: number };
    const [users, waitlist, expenses, income, groupExpenses, settlements, logins] =
      await Promise.all([
        UserModel.aggregate<Row>(perDay()),
        WaitlistEntryModel.aggregate<Row>(perDay()),
        ExpenseModel.aggregate<Row>(perDay({ source: ExpenseSource.Personal })),
        IncomeModel.aggregate<Row>(perDay()),
        GroupExpenseModel.aggregate<Row>(perDay()),
        SettlementModel.aggregate<Row>(perDay()),
        AuthEventModel.aggregate<Row>(perDay({ type: AuthEventType.Login, success: true })),
      ]);

    const toMap = (rows: Row[]) => new Map(rows.map((r) => [r._id, r.count]));
    const maps = {
      users: toMap(users),
      waitlist: toMap(waitlist),
      expenses: toMap(expenses),
      income: toMap(income),
      groupExpenses: toMap(groupExpenses),
      settlements: toMap(settlements),
      logins: toMap(logins),
    };

    const points: TimeseriesPoint[] = [];
    for (let i = 0; i < days; i++) {
      const date = new Date(start.getTime() + i * DAY).toISOString().slice(0, 10);
      points.push({
        date,
        users: maps.users.get(date) ?? 0,
        waitlist: maps.waitlist.get(date) ?? 0,
        expenses: maps.expenses.get(date) ?? 0,
        income: maps.income.get(date) ?? 0,
        groupExpenses: maps.groupExpenses.get(date) ?? 0,
        settlements: maps.settlements.get(date) ?? 0,
        logins: maps.logins.get(date) ?? 0,
      });
    }
    return points;
  }
}

export const adminStatsService = new AdminStatsService();
