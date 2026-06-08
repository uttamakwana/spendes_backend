import { type FilterQuery } from 'mongoose';
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
}

export const settlementsRepository = new SettlementsRepository();
