import type { Request } from 'express';
import { Types, type FilterQuery } from 'mongoose';
import { NotFoundException } from '../../../common/errors/http-exception';
import {
  GroupExpenseModel,
  GroupModel,
  NotificationModel,
  SettlementModel,
} from '../../../database/models.registry';
import type { GroupDocument } from '../../groups/groups.model';
import { GroupMemberStatus } from '../../groups/groups.enums';
import { computeNetBalances, simplifyDebts } from '../../splits/split-calculator';
import type { GroupExpenseDocument } from '../../splits/group-expense.model';
import type { SettlementDocument } from '../../splits/settlement.model';
import type { NotificationDocument } from '../../notifications/notification.model';
import {
  castIds,
  dateRange,
  escapeRegex,
  listWithUsers,
  loadUserBriefs,
  round2,
  toCurrencyTotals,
  byCurrencyStage,
  withId,
} from '../admin.helpers';
import type {
  ListDisputesQuery,
  ListGroupActivityQuery,
  ListGroupsQuery,
  UpdateGroupInput,
} from '../admin.validation';
import { auditService } from '../audit/audit.service';

type GroupLite = Pick<GroupDocument, '_id' | 'name' | 'kind' | 'members'>;

/** Loads the groups referenced by a page of rows, keyed by id. */
async function loadGroups(ids: (Types.ObjectId | undefined)[]): Promise<Map<string, GroupLite>> {
  const unique = [...new Set(ids.filter(Boolean).map(String))];
  if (!unique.length) return new Map();
  const groups = await GroupModel.find({ _id: { $in: unique } })
    .select('name kind members._id members.displayName')
    .lean<GroupLite[]>();
  return new Map(groups.map((g) => [g._id.toString(), g]));
}

const memberNames = (g?: GroupLite): Record<string, string> =>
  Object.fromEntries((g?.members ?? []).map((m) => [m._id.toString(), m.displayName]));

const groupRef = (g?: GroupLite) =>
  g ? { id: g._id.toString(), name: g.name, kind: g.kind } : null;

/** Groups, friendships (direct groups), splits, settlements and disputes. */
class AdminSocialService {
  async listGroups(query: ListGroupsQuery) {
    const filter: FilterQuery<GroupDocument> = {};
    if (query.kind) filter.kind = query.kind;
    if (query.isActive !== undefined) filter.isActive = query.isActive;
    if (query.userId) filter['members.userId'] = query.userId;
    const when = dateRange(query.from, query.to);
    if (when) filter.createdAt = when;
    if (query.search) {
      const rx = new RegExp(escapeRegex(query.search), 'i');
      filter.$or = [{ name: rx }, { 'members.displayName': rx }, { 'members.phoneNumber': rx }];
    }

    const page = await listWithUsers(
      GroupModel,
      filter,
      query,
      { updatedAt: -1 },
      {
        userField: 'createdBy',
      },
    );
    const ids = page.items.map((g) => new Types.ObjectId(g.id as string));
    const [expenseStats, settlementCounts] = await Promise.all([
      GroupExpenseModel.aggregate<{ _id: Types.ObjectId; count: number; lastAt: Date }>([
        { $match: { groupId: { $in: ids } } },
        { $group: { _id: '$groupId', count: { $sum: 1 }, lastAt: { $max: '$createdAt' } } },
      ]),
      SettlementModel.aggregate<{ _id: Types.ObjectId; count: number }>([
        { $match: { groupId: { $in: ids } } },
        { $group: { _id: '$groupId', count: { $sum: 1 } } },
      ]),
    ]);
    const exp = new Map(expenseStats.map((r) => [r._id.toString(), r]));
    const set = new Map(settlementCounts.map((r) => [r._id.toString(), r.count]));

    return {
      ...page,
      items: page.items.map((g) => {
        const members = (g.members as GroupDocument['members']) ?? [];
        return {
          id: g.id,
          name: g.name,
          kind: g.kind ?? 'standard',
          currency: g.currency,
          isActive: g.isActive,
          createdAt: g.createdAt,
          updatedAt: g.updatedAt,
          owner: g.user,
          memberCount: members.filter((m) => m.status === GroupMemberStatus.Active).length,
          invitedCount: members.filter((m) => m.status === GroupMemberStatus.Invited).length,
          expenseCount: exp.get(g.id as string)?.count ?? 0,
          settlementCount: set.get(g.id as string) ?? 0,
          lastExpenseAt: exp.get(g.id as string)?.lastAt ?? null,
        };
      }),
    };
  }

  async getGroup(id: string) {
    const group = await GroupModel.findById(id).lean<GroupDocument>();
    if (!group) throw new NotFoundException('Group not found');
    const groupId = group._id;

    const [expenses, settlements, disputes] = await Promise.all([
      GroupExpenseModel.find({ groupId }).select('paidBy splits amount currency createdAt').lean(),
      SettlementModel.find({ groupId }).select('fromMemberId toMemberId amount currency').lean(),
      NotificationModel.countDocuments({ groupId, isDisputed: true }),
    ]);

    const briefs = await loadUserBriefs([group.createdBy, ...group.members.map((m) => m.userId)]);
    const names = memberNames(group as GroupLite);

    // Same math the app uses, so the admin sees exactly what members see.
    const net = computeNetBalances(
      group.members.map((m) => m._id.toString()),
      expenses.map((e) => ({
        paidBy: e.paidBy.map((p) => ({ memberId: p.memberId.toString(), amount: p.amount })),
        splits: e.splits.map((s) => ({ memberId: s.memberId.toString(), amount: s.amount })),
      })),
      settlements.map((s) => ({
        fromMemberId: s.fromMemberId.toString(),
        toMemberId: s.toMemberId.toString(),
        amount: s.amount,
      })),
    );

    const [spend, settled] = await Promise.all([
      GroupExpenseModel.aggregate([{ $match: { groupId } }, byCurrencyStage()]),
      SettlementModel.aggregate([{ $match: { groupId } }, byCurrencyStage()]),
    ]);

    return {
      group: {
        ...withId(group),
        kind: group.kind ?? 'standard',
        owner: briefs.get(group.createdBy.toString()) ?? null,
        members: group.members.map((m) => ({
          ...m,
          id: m._id.toString(),
          user: m.userId ? (briefs.get(m.userId.toString()) ?? null) : null,
        })),
      },
      stats: {
        expenses: expenses.length,
        settlements: settlements.length,
        openDisputes: disputes,
        spend: toCurrencyTotals(spend),
        settled: toCurrencyTotals(settled),
        lastExpenseAt: expenses.reduce<Date | null>(
          (max, e) => (!max || e.createdAt > max ? e.createdAt : max),
          null,
        ),
      },
      balances: [...net.entries()].map(([memberId, paise]) => ({
        memberId,
        displayName: names[memberId] ?? 'Unknown',
        net: round2(paise / 100),
      })),
      // `simplifyDebts` already returns major units (unlike the paise net map).
      suggestedTransfers: simplifyDebts(net).map((d) => ({
        ...d,
        fromName: names[d.fromMemberId] ?? 'Unknown',
        toName: names[d.toMemberId] ?? 'Unknown',
      })),
    };
  }

  async updateGroup(req: Request, id: string, body: UpdateGroupInput) {
    const group = await GroupModel.findById(id);
    if (!group) throw new NotFoundException('Group not found');
    const before = group.isActive;
    group.isActive = body.isActive;
    await group.save();
    await auditService.record(req, {
      action: body.isActive ? 'group.restore' : 'group.archive',
      targetType: 'group',
      targetId: id,
      summary: `${body.isActive ? 'Restored' : 'Archived'} ${group.kind === 'direct' ? 'friendship' : 'group'} "${group.name}"`,
      before: { isActive: before },
      after: { isActive: body.isActive },
    });
    return { id, isActive: group.isActive };
  }

  async listGroupExpenses(query: ListGroupActivityQuery) {
    const filter: FilterQuery<GroupExpenseDocument> = {};
    if (query.groupId) filter.groupId = query.groupId;
    if (query.userId) filter.createdByUserId = query.userId;
    if (query.currency) filter.currency = query.currency;
    const when = dateRange(query.from, query.to);
    if (when) filter.spentAt = when;
    if (query.search) {
      const rx = new RegExp(escapeRegex(query.search), 'i');
      filter.$or = [{ description: rx }, { category: rx }, { notes: rx }];
    }
    const [page, sums] = await Promise.all([
      listWithUsers(
        GroupExpenseModel,
        filter,
        query,
        { spentAt: -1 },
        {
          userField: 'createdByUserId',
        },
      ),
      GroupExpenseModel.aggregate([
        { $match: castIds(filter, ['groupId', 'createdByUserId']) },
        byCurrencyStage(),
      ]),
    ]);
    const groups = await loadGroups(page.items.map((r) => r.groupId as Types.ObjectId));
    return {
      ...page,
      totals: toCurrencyTotals(sums),
      items: page.items.map((r) => {
        const g = groups.get(String(r.groupId));
        return { ...r, group: groupRef(g), memberNames: memberNames(g) };
      }),
    };
  }

  async listSettlements(query: ListGroupActivityQuery) {
    const filter: FilterQuery<SettlementDocument> = {};
    if (query.groupId) filter.groupId = query.groupId;
    if (query.userId) filter.createdByUserId = query.userId;
    if (query.currency) filter.currency = query.currency;
    const when = dateRange(query.from, query.to);
    if (when) filter.settledAt = when;
    if (query.search) {
      const rx = new RegExp(escapeRegex(query.search), 'i');
      filter.$or = [{ note: rx }, { reference: rx }];
    }
    const [page, sums] = await Promise.all([
      listWithUsers(
        SettlementModel,
        filter,
        query,
        { settledAt: -1 },
        {
          userField: 'createdByUserId',
        },
      ),
      SettlementModel.aggregate([
        { $match: castIds(filter, ['groupId', 'createdByUserId']) },
        byCurrencyStage(),
      ]),
    ]);
    const groups = await loadGroups(page.items.map((r) => r.groupId as Types.ObjectId));
    return {
      ...page,
      totals: toCurrencyTotals(sums),
      items: page.items.map((r) => {
        const g = groups.get(String(r.groupId));
        const names = memberNames(g);
        return {
          ...r,
          group: groupRef(g),
          fromName: names[String(r.fromMemberId)] ?? 'Unknown',
          toName: names[String(r.toMemberId)] ?? 'Unknown',
        };
      }),
    };
  }

  /** Splits a member flagged from the review screen ("not mine", "wrong amount", …). */
  async listDisputes(query: ListDisputesQuery) {
    const filter: FilterQuery<NotificationDocument> = { isDisputed: true };
    if (query.userId) filter.userId = query.userId;
    if (query.reason) filter.disputeReason = query.reason;
    const when = dateRange(query.from, query.to);
    if (when) filter.updatedAt = when;
    if (query.search) {
      const rx = new RegExp(escapeRegex(query.search), 'i');
      filter.$or = [{ title: rx }, { body: rx }, { disputeNote: rx }, { actorName: rx }];
    }
    const page = await listWithUsers(NotificationModel, filter, query, { updatedAt: -1 });
    const [groups, actors] = await Promise.all([
      loadGroups(page.items.map((r) => r.groupId as Types.ObjectId)),
      loadUserBriefs(page.items.map((r) => r.actorUserId as Types.ObjectId)),
    ]);
    return {
      ...page,
      items: page.items.map((r) => ({
        ...r,
        group: groupRef(groups.get(String(r.groupId))),
        actor: actors.get(String(r.actorUserId)) ?? null,
      })),
    };
  }

  async disputeStats() {
    const rows = await NotificationModel.aggregate<{ _id: string; count: number }>([
      { $match: { isDisputed: true } },
      { $group: { _id: '$disputeReason', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]);
    return rows.map((r) => ({ key: r._id ?? 'other', count: r.count }));
  }
}

export const adminSocialService = new AdminSocialService();
