import { type FilterQuery, Types, type UpdateQuery } from 'mongoose';
import { BaseRepository } from '../../database/base.repository';
import { GoalModel, type GoalContribution, type GoalDocument } from './goals.model';

/**
 * Data access for goals. Owner-scoped lookups plus an atomic contribution that
 * pushes the deposit and increments the denormalized `currentAmount` in one update.
 */
export class GoalsRepository extends BaseRepository<GoalDocument> {
  constructor() {
    super(GoalModel);
  }

  /** Fetches a goal by id only if it belongs to `userId`; throws 404 otherwise. */
  findOwnedByIdOrThrow(id: string, userId: string): Promise<GoalDocument> {
    return this.findOneOrThrow({ _id: id, userId } as FilterQuery<GoalDocument>);
  }

  /** Updates a goal in place, scoped to its owner; throws 404 if not found/owned. */
  updateOwned(
    id: string,
    userId: string,
    update: UpdateQuery<GoalDocument>,
  ): Promise<GoalDocument> {
    return this.findOneAndUpdate({ _id: id, userId } as FilterQuery<GoalDocument>, update);
  }

  /** Deletes a goal, scoped to its owner; throws 404 if not found/owned. */
  deleteOwned(id: string, userId: string): Promise<GoalDocument> {
    return this.deleteOne({ _id: id, userId } as FilterQuery<GoalDocument>);
  }

  /** Records a contribution and bumps `currentAmount` atomically; throws 404 if not found/owned. */
  addContribution(
    id: string,
    userId: string,
    contribution: GoalContribution,
  ): Promise<GoalDocument> {
    return this.findOneAndUpdate({ _id: id, userId } as FilterQuery<GoalDocument>, {
      $push: { contributions: contribution },
      $inc: { currentAmount: contribution.amount },
    });
  }

  /** A user's active goals — used by analytics to assess goal feasibility. */
  findActiveForUser(userId: string): Promise<GoalDocument[]> {
    return this.find({
      userId: new Types.ObjectId(userId),
      isActive: true,
    } as FilterQuery<GoalDocument>);
  }

  /** Total saved across a user's active goals — an asset line for the analytics net worth. */
  async sumCurrentAmount(userId: string): Promise<number> {
    const [result] = await this.aggregate<{ total: number }>([
      { $match: { userId: new Types.ObjectId(userId), isActive: true } },
      { $group: { _id: null, total: { $sum: '$currentAmount' } } },
    ]);
    return result?.total ?? 0;
  }
}

/** Shared singleton instance used across the app. */
export const goalsRepository = new GoalsRepository();
