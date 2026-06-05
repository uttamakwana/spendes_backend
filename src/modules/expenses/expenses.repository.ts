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
}

/** Shared singleton instance used across the app. */
export const expensesRepository = new ExpensesRepository();
