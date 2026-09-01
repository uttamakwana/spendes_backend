import { type FilterQuery, Types } from 'mongoose';
import { BaseRepository } from '../../database/base.repository';
import { GroupExpenseModel, type GroupExpenseDocument } from './group-expense.model';
import { SettlementModel, type SettlementDocument } from './settlement.model';

/** Data access for group expenses, scoped to their owning group. */
export class GroupExpensesRepository extends BaseRepository<GroupExpenseDocument> {
  constructor() {
    super(GroupExpenseModel);
  }

  /** Fetches an expense only if it belongs to `groupId`; throws 404 otherwise. */
  findInGroupOrThrow(expenseId: string, groupId: string): Promise<GroupExpenseDocument> {
    return this.findOneOrThrow({ _id: expenseId, groupId } as FilterQuery<GroupExpenseDocument>);
  }

  /** Every expense in a group (used to compute balances). */
  findAllForGroup(groupId: string): Promise<GroupExpenseDocument[]> {
    return this.find({ groupId } as FilterQuery<GroupExpenseDocument>);
  }

  /**
   * Every expense across several groups in one query — for the cross-group balance
   * roll-up, which would otherwise fan out into a query per group.
   */
  findAllForGroups(groupIds: string[]): Promise<GroupExpenseDocument[]> {
    if (groupIds.length === 0) return Promise.resolve([]);
    return this.find({
      groupId: { $in: groupIds.map((id) => new Types.ObjectId(id)) },
    } as FilterQuery<GroupExpenseDocument>);
  }
}

export const groupExpensesRepository = new GroupExpensesRepository();

/** Data access for settlements, scoped to their owning group. */
export class SettlementsRepository extends BaseRepository<SettlementDocument> {
  constructor() {
    super(SettlementModel);
  }

  /** Every settlement in a group (used to compute balances). */
  findAllForGroup(groupId: string): Promise<SettlementDocument[]> {
    return this.find({ groupId } as FilterQuery<SettlementDocument>);
  }

  /** Every settlement across several groups in one query (see the expense twin). */
  findAllForGroups(groupIds: string[]): Promise<SettlementDocument[]> {
    if (groupIds.length === 0) return Promise.resolve([]);
    return this.find({
      groupId: { $in: groupIds.map((id) => new Types.ObjectId(id)) },
    } as FilterQuery<SettlementDocument>);
  }

  /** The settlement matching a UPI transaction reference within a group, if any (idempotency). */
  async findByReference(groupId: string, reference: string): Promise<SettlementDocument | null> {
    const [doc] = await this.find({ groupId, reference } as FilterQuery<SettlementDocument>);
    return doc ?? null;
  }
}

export const settlementsRepository = new SettlementsRepository();
