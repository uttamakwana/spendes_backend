import { type FilterQuery, type UpdateQuery } from 'mongoose';
import { BaseRepository } from '../../database/base.repository';
import { BudgetModel, type BudgetDocument } from './budgets.model';

/**
 * Data access for budgets. Inherits generic CRUD + pagination and adds owner-scoped
 * lookups so a user can only ever read or mutate their own budgets.
 */
export class BudgetsRepository extends BaseRepository<BudgetDocument> {
  constructor() {
    super(BudgetModel);
  }

  /** Fetches a budget by id only if it belongs to `userId`; throws 404 otherwise. */
  findOwnedByIdOrThrow(id: string, userId: string): Promise<BudgetDocument> {
    return this.findOneOrThrow({ _id: id, userId } as FilterQuery<BudgetDocument>);
  }

  /** Updates a budget in place, scoped to its owner; throws 404 if not found/owned. */
  updateOwned(
    id: string,
    userId: string,
    update: UpdateQuery<BudgetDocument>,
  ): Promise<BudgetDocument> {
    return this.findOneAndUpdate({ _id: id, userId } as FilterQuery<BudgetDocument>, update);
  }

  /** Deletes a budget, scoped to its owner; throws 404 if not found/owned. */
  deleteOwned(id: string, userId: string): Promise<BudgetDocument> {
    return this.deleteOne({ _id: id, userId } as FilterQuery<BudgetDocument>);
  }
}

/** Shared singleton instance used across the app. */
export const budgetsRepository = new BudgetsRepository();
