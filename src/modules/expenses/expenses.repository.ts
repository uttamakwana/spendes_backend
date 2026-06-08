import { type FilterQuery, Types, type UpdateQuery } from 'mongoose';
import { BaseRepository } from '../../database/base.repository';
import { ExpenseModel, type ExpenseDocument } from './expenses.model';

/** Inclusive date window applied to `spentAt` when summarizing. */
export interface ExpenseDateRange {
  from?: Date;
  to?: Date;
}

/** Shape returned by the `$facet` summary aggregation (one bucket per `_id`). */
export interface ExpenseSummaryAggregate {
  overall: { totalAmount: number; count: number }[];
  byCategory: { _id: string; totalAmount: number; count: number }[];
  byPaymentMethod: { _id: string; totalAmount: number; count: number }[];
}

/**
 * Data access for expenses. Inherits generic CRUD + pagination from
 * {@link BaseRepository} and adds owner-scoped lookups (so a user can only ever
 * touch their own rows) and the category/payment-method spend rollup.
 */
export class ExpensesRepository extends BaseRepository<ExpenseDocument> {
  constructor() {
    super(ExpenseModel);
  }

  /** Fetches an expense by id only if it belongs to `userId`; throws 404 otherwise. */
  findOwnedByIdOrThrow(id: string, userId: string): Promise<ExpenseDocument> {
    return this.findOneOrThrow({ _id: id, userId } as FilterQuery<ExpenseDocument>);
  }

  /** Updates an expense in place, scoped to its owner; throws 404 if not found/owned. */
  updateOwned(
    id: string,
    userId: string,
    update: UpdateQuery<ExpenseDocument>,
  ): Promise<ExpenseDocument> {
    return this.findOneAndUpdate({ _id: id, userId } as FilterQuery<ExpenseDocument>, update);
  }

  /** Deletes an expense, scoped to its owner; throws 404 if not found/owned. */
  deleteOwned(id: string, userId: string): Promise<ExpenseDocument> {
    return this.deleteOne({ _id: id, userId } as FilterQuery<ExpenseDocument>);
  }

  /** Removes every materialized group-share row for a group expense. Returns the count removed. */
  async deleteByGroupExpense(groupExpenseId: string): Promise<number> {
    const result = await this.model
      .deleteMany({ groupExpenseId: new Types.ObjectId(groupExpenseId) })
      .exec();
    return result.deletedCount ?? 0;
  }

  /** Propagates metadata changes to every materialized group-share row for a group expense. */
  async updateByGroupExpense(
    groupExpenseId: string,
    fields: UpdateQuery<ExpenseDocument>,
  ): Promise<number> {
    const result = await this.model
      .updateMany({ groupExpenseId: new Types.ObjectId(groupExpenseId) }, { $set: fields })
      .exec();
    return result.modifiedCount ?? 0;
  }

  /** Whether a user already has a materialized share row for a given group expense (dedup for backfill). */
  existsGroupShare(userId: string, groupExpenseId: string): Promise<boolean> {
    return this.exists({
      userId: new Types.ObjectId(userId),
      groupExpenseId: new Types.ObjectId(groupExpenseId),
    } as FilterQuery<ExpenseDocument>);
  }

  /**
   * Total expense amount for a user within an inclusive `spentAt` window, optionally
   * scoped to one category. Includes materialized group/friend shares, so a budget's
   * "spent" reflects shared spending too. Used by the budgets module.
   */
  async sumAmount(
    userId: string,
    range: { from: Date; to: Date },
    category?: string,
  ): Promise<number> {
    const match: FilterQuery<ExpenseDocument> = {
      userId: new Types.ObjectId(userId),
      spentAt: { $gte: range.from, $lte: range.to },
    };
    if (category) {
      match.category = category;
    }
    const [result] = await this.aggregate<{ total: number }>([
      { $match: match },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]);
    return result?.total ?? 0;
  }

  /**
   * Rolls up a user's spend over an optional date window into overall totals plus
   * per-category and per-payment-method breakdowns, in a single round trip.
   */
  async summarize(userId: string, range: ExpenseDateRange): Promise<ExpenseSummaryAggregate> {
    const match: FilterQuery<ExpenseDocument> = { userId: new Types.ObjectId(userId) };
    if (range.from || range.to) {
      match.spentAt = {
        ...(range.from ? { $gte: range.from } : {}),
        ...(range.to ? { $lte: range.to } : {}),
      };
    }

    const [result] = await this.aggregate<ExpenseSummaryAggregate>([
      { $match: match },
      {
        $facet: {
          overall: [
            { $group: { _id: null, totalAmount: { $sum: '$amount' }, count: { $sum: 1 } } },
          ],
          byCategory: [
            { $group: { _id: '$category', totalAmount: { $sum: '$amount' }, count: { $sum: 1 } } },
            { $sort: { totalAmount: -1 } },
          ],
          byPaymentMethod: [
            {
              $group: {
                _id: '$paymentMethod',
                totalAmount: { $sum: '$amount' },
                count: { $sum: 1 },
              },
            },
            { $sort: { totalAmount: -1 } },
          ],
        },
      },
    ]);

    return result ?? { overall: [], byCategory: [], byPaymentMethod: [] };
  }

  /** Per-(year,month) expense totals within a window — for the analytics cash-flow trend. */
  async monthlyTotals(
    userId: string,
    range: { from: Date; to: Date },
  ): Promise<{ year: number; month: number; total: number }[]> {
    const rows = await this.aggregate<{ _id: { year: number; month: number }; total: number }>([
      {
        $match: {
          userId: new Types.ObjectId(userId),
          spentAt: { $gte: range.from, $lte: range.to },
        },
      },
      {
        $group: {
          _id: { year: { $year: '$spentAt' }, month: { $month: '$spentAt' } },
          total: { $sum: '$amount' },
        },
      },
      { $sort: { '_id.year': 1, '_id.month': 1 } },
    ]);
    return rows.map((r) => ({ year: r._id.year, month: r._id.month, total: r.total }));
  }
}

/** Shared singleton instance used across the app. */
export const expensesRepository = new ExpensesRepository();
