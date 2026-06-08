import { type FilterQuery, Types, type UpdateQuery } from 'mongoose';
import { BaseRepository } from '../../database/base.repository';
import { IncomeModel, type IncomeDocument } from './income.model';

/** Inclusive date window applied to `receivedAt` when summarizing. */
export interface IncomeDateRange {
  from?: Date;
  to?: Date;
}

/** Shape returned by the `$facet` summary aggregation (one bucket per `_id`). */
export interface IncomeSummaryAggregate {
  overall: { totalAmount: number; count: number }[];
  byCategory: { _id: string; totalAmount: number; count: number }[];
  bySource: { _id: string; totalAmount: number; count: number }[];
}

/**
 * Data access for income. Inherits generic CRUD + pagination from
 * {@link BaseRepository} and adds owner-scoped lookups (so a user can only ever
 * touch their own rows) and the category/source income rollup.
 */
export class IncomeRepository extends BaseRepository<IncomeDocument> {
  constructor() {
    super(IncomeModel);
  }

  /** Fetches an income entry by id only if it belongs to `userId`; throws 404 otherwise. */
  findOwnedByIdOrThrow(id: string, userId: string): Promise<IncomeDocument> {
    return this.findOneOrThrow({ _id: id, userId } as FilterQuery<IncomeDocument>);
  }

  /** Updates an income entry in place, scoped to its owner; throws 404 if not found/owned. */
  updateOwned(
    id: string,
    userId: string,
    update: UpdateQuery<IncomeDocument>,
  ): Promise<IncomeDocument> {
    return this.findOneAndUpdate({ _id: id, userId } as FilterQuery<IncomeDocument>, update);
  }

  /** Deletes an income entry, scoped to its owner; throws 404 if not found/owned. */
  deleteOwned(id: string, userId: string): Promise<IncomeDocument> {
    return this.deleteOne({ _id: id, userId } as FilterQuery<IncomeDocument>);
  }

  /**
   * Rolls up a user's income over an optional date window into overall totals plus
   * per-category and per-source breakdowns, in a single round trip. The source
   * breakdown ignores entries with no recorded source (it would be a meaningless
   * "unspecified" bucket).
   */
  async summarize(userId: string, range: IncomeDateRange): Promise<IncomeSummaryAggregate> {
    const match: FilterQuery<IncomeDocument> = { userId: new Types.ObjectId(userId) };
    if (range.from || range.to) {
      match.receivedAt = {
        ...(range.from ? { $gte: range.from } : {}),
        ...(range.to ? { $lte: range.to } : {}),
      };
    }

    const [result] = await this.aggregate<IncomeSummaryAggregate>([
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
          bySource: [
            { $match: { source: { $nin: [null, ''] } } },
            { $group: { _id: '$source', totalAmount: { $sum: '$amount' }, count: { $sum: 1 } } },
            { $sort: { totalAmount: -1 } },
          ],
        },
      },
    ]);

    return result ?? { overall: [], byCategory: [], bySource: [] };
  }

  /** Total income for a user within a window — used by analytics for the monthly snapshot. */
  async sumAmount(userId: string, range: { from: Date; to: Date }): Promise<number> {
    const [result] = await this.aggregate<{ total: number }>([
      {
        $match: {
          userId: new Types.ObjectId(userId),
          receivedAt: { $gte: range.from, $lte: range.to },
        },
      },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]);
    return result?.total ?? 0;
  }

  /** Per-(year,month) income totals within a window — for the analytics cash-flow trend. */
  async monthlyTotals(
    userId: string,
    range: { from: Date; to: Date },
  ): Promise<{ year: number; month: number; total: number }[]> {
    const rows = await this.aggregate<{ _id: { year: number; month: number }; total: number }>([
      {
        $match: {
          userId: new Types.ObjectId(userId),
          receivedAt: { $gte: range.from, $lte: range.to },
        },
      },
      {
        $group: {
          _id: { year: { $year: '$receivedAt' }, month: { $month: '$receivedAt' } },
          total: { $sum: '$amount' },
        },
      },
      { $sort: { '_id.year': 1, '_id.month': 1 } },
    ]);
    return rows.map((r) => ({ year: r._id.year, month: r._id.month, total: r.total }));
  }
}

/** Shared singleton instance used across the app. */
export const incomeRepository = new IncomeRepository();
