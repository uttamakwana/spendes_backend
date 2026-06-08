import { Types, type UpdateQuery } from 'mongoose';
import { BadRequestException, ForbiddenException } from '../../common/errors/http-exception';
import { buildSort } from '../../common/utils/pagination';
import { paginate } from '../../common/utils/response';
import type { PaginatedData } from '../../common/types/api-response';
import { createLogger } from '../../logger';
import { GroupMemberStatus, GroupRole } from '../groups/groups.enums';
import type { GroupDocument, GroupMember } from '../groups/groups.model';
import { groupsRepository } from '../groups/groups.repository';
import { usersService } from '../users/users.service';
import type { UserDocument } from '../users/users.model';
import { paymentsService } from '../payments/payments.service';
import { expensesService } from '../expenses/expenses.service';
import { computeNetBalances, computeSplits, simplifyDebts } from './split-calculator';
import type { GroupExpenseDocument } from './group-expense.model';
import {
  GroupExpensesRepository,
  SettlementsRepository,
  groupExpensesRepository,
  settlementsRepository,
} from './splits.repository';
import {
  toGroupExpenseResponse,
  toSettlementResponse,
  type GroupBalancesResponse,
  type GroupExpenseResponse,
  type SettlementIntentResponse,
  type SettlementResponse,
} from './split-response';
import type {
  CreateGroupExpenseInput,
  CreateSettlementInput,
  ListGroupItemsQuery,
  SettlementIntentInput,
  UpdateGroupExpenseInput,
} from './splits.validation';

/** Money is stored to 2 decimal places — round once, at the boundary. */
const round2 = (value: number): number => Math.round(value * 100) / 100;

/**
 * Business logic for group expenses, balances and settlements. Every operation is
 * scoped to an active group membership (via the groups repository's member filter,
 * so a non-member 404s) and validates that every referenced member id is a current
 * member of *that* group. Split amounts are resolved up-front by the calculator so
 * balances are a straight sum; balances and "who owes whom" are derived on read.
 */
export class SplitsService {
  private readonly logger = createLogger('SplitsService');

  constructor(
    private readonly expenses: GroupExpensesRepository,
    private readonly settlements: SettlementsRepository,
  ) {}

  // --- Group expenses --------------------------------------------------------

  async createExpense(
    userId: string,
    groupId: string,
    dto: CreateGroupExpenseInput,
  ): Promise<GroupExpenseResponse> {
    const group = await groupsRepository.findForMemberOrThrow(groupId, userId);

    const referenced = [...dto.paidBy.map((p) => p.memberId), ...dto.splits.map((s) => s.memberId)];
    this.assertMembersPresent(group, referenced);

    const computed = computeSplits(dto.amount, dto.splitStrategy, dto.splits);
    const caller = this.callerMember(group, userId);

    const expense = await this.expenses.create({
      groupId: group._id,
      description: dto.description,
      amount: round2(dto.amount),
      currency: dto.currency?.toUpperCase() ?? group.currency,
      category: dto.category,
      paidBy: dto.paidBy.map((p) => ({
        memberId: new Types.ObjectId(p.memberId),
        amount: round2(p.amount),
      })),
      splitStrategy: dto.splitStrategy,
      splits: computed.map((c) => ({
        memberId: new Types.ObjectId(c.memberId),
        amount: c.amount,
        percentage: c.percentage,
        shares: c.shares,
      })),
      spentAt: dto.spentAt ?? new Date(),
      notes: dto.notes,
      createdByMemberId: caller._id,
      createdByUserId: new Types.ObjectId(userId),
    });

    await this.syncPersonalShares(group, expense);

    this.logger.info(`Group expense created: ${expense._id.toString()} in group ${groupId}`);
    return toGroupExpenseResponse(expense);
  }

  async listExpenses(
    userId: string,
    groupId: string,
    query: ListGroupItemsQuery,
  ): Promise<PaginatedData<GroupExpenseResponse>> {
    await groupsRepository.findForMemberOrThrow(groupId, userId);

    const result = await this.expenses.paginate({
      filter: { groupId: new Types.ObjectId(groupId) },
      page: query.page,
      limit: query.limit,
      sort: buildSort(query) ?? { spentAt: -1 },
    });

    return paginate(result.items.map(toGroupExpenseResponse), {
      page: result.page,
      limit: result.limit,
      totalItems: result.totalItems,
    });
  }

  async getExpense(
    userId: string,
    groupId: string,
    expenseId: string,
  ): Promise<GroupExpenseResponse> {
    await groupsRepository.findForMemberOrThrow(groupId, userId);
    const expense = await this.expenses.findInGroupOrThrow(expenseId, groupId);
    return toGroupExpenseResponse(expense);
  }

  async updateExpense(
    userId: string,
    groupId: string,
    expenseId: string,
    dto: UpdateGroupExpenseInput,
  ): Promise<GroupExpenseResponse> {
    const group = await groupsRepository.findForMemberOrThrow(groupId, userId);
    const expense = await this.expenses.findInGroupOrThrow(expenseId, groupId);
    this.assertCanModify(expense, group, userId);

    const update: UpdateQuery<GroupExpenseDocument> = { ...dto };
    const updated = await this.expenses.updateById(expenseId, update);

    // Keep each member's materialized share row in sync with the metadata edits.
    await expensesService.syncGroupShareExpenses(expenseId, {
      description: updated.description,
      category: this.shareCategory(updated.category),
      spentAt: updated.spentAt,
      notes: updated.notes,
    });

    return toGroupExpenseResponse(updated);
  }

  async deleteExpense(userId: string, groupId: string, expenseId: string): Promise<void> {
    const group = await groupsRepository.findForMemberOrThrow(groupId, userId);
    const expense = await this.expenses.findInGroupOrThrow(expenseId, groupId);
    this.assertCanModify(expense, group, userId);
    await this.expenses.deleteById(expenseId);
    await expensesService.removeGroupShareExpenses(expenseId);
    this.logger.info(`Group expense deleted: ${expenseId} from group ${groupId}`);
  }

  // --- Settlements -----------------------------------------------------------

  async createSettlement(
    userId: string,
    groupId: string,
    dto: CreateSettlementInput,
  ): Promise<SettlementResponse> {
    const group = await groupsRepository.findForMemberOrThrow(groupId, userId);
    const fromMemberId = dto.fromMemberId ?? this.callerMember(group, userId)._id.toString();
    const toMemberId = dto.toMemberId;

    if (fromMemberId === toMemberId) {
      throw new BadRequestException('A settlement must be between two different members');
    }
    this.assertMembersPresent(group, [fromMemberId, toMemberId]);

    const settlement = await this.settlements.create({
      groupId: group._id,
      fromMemberId: new Types.ObjectId(fromMemberId),
      toMemberId: new Types.ObjectId(toMemberId),
      amount: round2(dto.amount),
      currency: dto.currency?.toUpperCase() ?? group.currency,
      method: dto.method,
      note: dto.note,
      settledAt: dto.settledAt ?? new Date(),
      createdByUserId: new Types.ObjectId(userId),
    });

    this.logger.info(`Settlement recorded: ${settlement._id.toString()} in group ${groupId}`);
    return toSettlementResponse(settlement);
  }

  async listSettlements(
    userId: string,
    groupId: string,
    query: ListGroupItemsQuery,
  ): Promise<PaginatedData<SettlementResponse>> {
    await groupsRepository.findForMemberOrThrow(groupId, userId);

    const result = await this.settlements.paginate({
      filter: { groupId: new Types.ObjectId(groupId) },
      page: query.page,
      limit: query.limit,
      sort: buildSort(query) ?? { settledAt: -1 },
    });

    return paginate(result.items.map(toSettlementResponse), {
      page: result.page,
      limit: result.limit,
      totalItems: result.totalItems,
    });
  }

  /** Builds a UPI deep link to pay a member; requires that member to have a UPI id on file. */
  async buildSettlementIntent(
    userId: string,
    groupId: string,
    dto: SettlementIntentInput,
  ): Promise<SettlementIntentResponse> {
    const group = await groupsRepository.findForMemberOrThrow(groupId, userId);
    const payee = this.findPresentMember(group, dto.toMemberId);

    if (!payee.userId) {
      throw new BadRequestException(
        'This member has not joined Spendes yet, so they have no UPI id',
      );
    }
    const payeeUser = await usersService.findEntityById(payee.userId.toString());
    if (!payeeUser?.upiId) {
      throw new BadRequestException('This member has not added a UPI id to receive payments');
    }

    const intent = paymentsService.createUpiIntent({
      payeeVpa: payeeUser.upiId,
      payeeName: payee.displayName,
      amount: dto.amount,
      currency: group.currency,
      note: dto.note ?? `Settling up in ${group.name}`,
      transactionRef: group._id.toString(),
    });

    return {
      provider: intent.provider,
      uri: intent.uri,
      toMemberId: payee._id.toString(),
      payeeName: intent.payeeName,
      payeeVpa: intent.payeeVpa,
      amount: intent.amount,
      currency: intent.currency,
      note: intent.note,
    };
  }

  // --- Balances --------------------------------------------------------------

  async getBalances(userId: string, groupId: string): Promise<GroupBalancesResponse> {
    const group = await groupsRepository.findForMemberOrThrow(groupId, userId);
    const [expenses, settlements] = await Promise.all([
      this.expenses.findAllForGroup(groupId),
      this.settlements.findAllForGroup(groupId),
    ]);

    // Every member who currently belongs or who appears in any expense/settlement
    // (a removed member may still carry a non-zero balance).
    const nameById = new Map(group.members.map((m) => [m._id.toString(), m.displayName]));
    const ids = new Set<string>(this.presentMembers(group).map((m) => m._id.toString()));
    for (const expense of expenses) {
      expense.paidBy.forEach((p) => ids.add(p.memberId.toString()));
      expense.splits.forEach((s) => ids.add(s.memberId.toString()));
    }
    for (const settlement of settlements) {
      ids.add(settlement.fromMemberId.toString());
      ids.add(settlement.toMemberId.toString());
    }
    const memberIds = [...ids];

    const net = computeNetBalances(
      memberIds,
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

    const balances = memberIds.map((id) => ({
      memberId: id,
      displayName: nameById.get(id) ?? 'Unknown',
      net: round2((net.get(id) ?? 0) / 100),
    }));

    const suggestedTransfers = simplifyDebts(net).map((t) => ({
      fromMemberId: t.fromMemberId,
      fromName: nameById.get(t.fromMemberId) ?? 'Unknown',
      toMemberId: t.toMemberId,
      toName: nameById.get(t.toMemberId) ?? 'Unknown',
      amount: t.amount,
    }));

    const me = this.presentMembers(group).find((m) => m.userId?.toString() === userId);
    return {
      groupId,
      currency: group.currency,
      balances,
      suggestedTransfers,
      myMemberId: me?._id.toString(),
      myNet: me ? round2((net.get(me._id.toString()) ?? 0) / 100) : undefined,
    };
  }

  // --- Personal-expense materialization --------------------------------------

  /**
   * Materializes each registered member's share of a group expense into their
   * personal expenses, so a split "becomes" a tracked expense that flows into the
   * expense list, summary, budgets and analytics. Placeholders (no linked account)
   * are skipped here and backfilled when they register
   * ({@link backfillGroupShareExpenses}).
   */
  private async syncPersonalShares(
    group: GroupDocument,
    expense: GroupExpenseDocument,
  ): Promise<void> {
    for (const split of expense.splits) {
      const member = group.members.find((m) => m._id.toString() === split.memberId.toString());
      if (!member?.userId) {
        continue;
      }
      await expensesService.createGroupShareExpense({
        userId: member.userId.toString(),
        amount: split.amount,
        currency: expense.currency,
        category: this.shareCategory(expense.category),
        description: expense.description,
        notes: expense.notes,
        spentAt: expense.spentAt,
        groupId: group._id.toString(),
        groupExpenseId: expense._id.toString(),
      });
    }
  }

  /**
   * Creates any missing group-share rows for a user across all groups they belong
   * to — called right after registration (once their phone placeholders have been
   * linked) so their pre-join shares show up. Never throws (must not break sign-up).
   */
  async backfillGroupShareExpenses(user: UserDocument): Promise<void> {
    try {
      const userId = user._id.toString();
      const groups = await groupsRepository.find(groupsRepository.buildMemberFilter(userId));
      for (const group of groups) {
        const me = this.presentMembers(group).find((m) => m.userId?.toString() === userId);
        if (!me) {
          continue;
        }
        const expenses = await this.expenses.findAllForGroup(group._id.toString());
        for (const expense of expenses) {
          const split = expense.splits.find((s) => s.memberId.toString() === me._id.toString());
          if (!split) {
            continue;
          }
          if (await expensesService.hasGroupShareExpense(userId, expense._id.toString())) {
            continue;
          }
          await expensesService.createGroupShareExpense({
            userId,
            amount: split.amount,
            currency: expense.currency,
            category: this.shareCategory(expense.category),
            description: expense.description,
            notes: expense.notes,
            spentAt: expense.spentAt,
            groupId: group._id.toString(),
            groupExpenseId: expense._id.toString(),
          });
        }
      }
    } catch (error) {
      this.logger.warn(
        `Backfill of group-share expenses failed for ${user._id.toString()}: ${(error as Error).message}`,
      );
    }
  }

  /** A group expense's category, or a sensible default label for the personal share row. */
  private shareCategory(category?: string): string {
    return category && category.trim() ? category : 'Group';
  }

  // --- Internals -------------------------------------------------------------

  private presentMembers(group: GroupDocument): GroupMember[] {
    return group.members.filter((m) => m.status !== GroupMemberStatus.Removed);
  }

  private findPresentMember(group: GroupDocument, memberId: string): GroupMember {
    const member = this.presentMembers(group).find((m) => m._id.toString() === memberId);
    if (!member) {
      throw new BadRequestException('Referenced member is not a current member of this group');
    }
    return member;
  }

  /** Throws if any id is not a current (non-removed) member of the group. */
  private assertMembersPresent(group: GroupDocument, memberIds: string[]): void {
    const present = new Set(this.presentMembers(group).map((m) => m._id.toString()));
    if (memberIds.some((id) => !present.has(id))) {
      throw new BadRequestException('All payers and split members must be current group members');
    }
  }

  /** The group member subdocument for the requesting user (must be an active member). */
  private callerMember(group: GroupDocument, userId: string): GroupMember {
    const member = this.presentMembers(group).find((m) => m.userId?.toString() === userId);
    if (!member) {
      throw new ForbiddenException('You are not a member of this group');
    }
    return member;
  }

  private isAdmin(group: GroupDocument, userId: string): boolean {
    return this.presentMembers(group).some(
      (m) => m.userId?.toString() === userId && m.role === GroupRole.Admin,
    );
  }

  /** Only the expense's creator or a group admin may edit/delete it. */
  private assertCanModify(
    expense: GroupExpenseDocument,
    group: GroupDocument,
    userId: string,
  ): void {
    if (expense.createdByUserId.toString() !== userId && !this.isAdmin(group, userId)) {
      throw new ForbiddenException('Only the expense creator or a group admin can modify it');
    }
  }
}

/** Shared singleton instance used across the app. */
export const splitsService = new SplitsService(groupExpensesRepository, settlementsRepository);
