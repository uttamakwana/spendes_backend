import { type FilterQuery, Types, type UpdateQuery } from 'mongoose';
import { BaseRepository } from '../../database/base.repository';
import {
  InvestmentModel,
  type InvestmentContribution,
  type InvestmentDocument,
} from './investments.model';

/**
 * Data access for investments. Inherits generic CRUD + pagination and adds
 * owner-scoped lookups so a user can only ever touch their own holdings.
 */
export class InvestmentsRepository extends BaseRepository<InvestmentDocument> {
  constructor() {
    super(InvestmentModel);
  }

  /** Fetches a holding by id only if it belongs to `userId`; throws 404 otherwise. */
  findOwnedByIdOrThrow(id: string, userId: string): Promise<InvestmentDocument> {
    return this.findOneOrThrow({ _id: id, userId } as FilterQuery<InvestmentDocument>);
  }

  /** Updates a holding in place, scoped to its owner; throws 404 if not found/owned. */
  updateOwned(
    id: string,
    userId: string,
    update: UpdateQuery<InvestmentDocument>,
  ): Promise<InvestmentDocument> {
    return this.findOneAndUpdate({ _id: id, userId } as FilterQuery<InvestmentDocument>, update);
  }

  /** Deletes a holding, scoped to its owner; throws 404 if not found/owned. */
  deleteOwned(id: string, userId: string): Promise<InvestmentDocument> {
    return this.deleteOne({ _id: id, userId } as FilterQuery<InvestmentDocument>);
  }

  /**
   * Records a contribution and bumps the denormalized `investedAmount` atomically,
   * optionally refreshing `currentValue` in the same update; throws 404 if not
   * found/owned. Mirrors the goals contribution pattern.
   */
  addContribution(
    id: string,
    userId: string,
    contribution: InvestmentContribution,
    currentValue?: number,
  ): Promise<InvestmentDocument> {
    const update: UpdateQuery<InvestmentDocument> = {
      $push: { contributions: contribution },
      $inc: { investedAmount: contribution.amount },
    };
    if (currentValue !== undefined) {
      update.$set = { currentValue };
    }
    return this.findOneAndUpdate({ _id: id, userId } as FilterQuery<InvestmentDocument>, update);
  }

  /** All of a user's active holdings (used to compute the portfolio summary). */
  findActiveForUser(userId: string): Promise<InvestmentDocument[]> {
    return this.find({
      userId: new Types.ObjectId(userId),
      isActive: true,
    } as FilterQuery<InvestmentDocument>);
  }
}

/** Shared singleton instance used across the app. */
export const investmentsRepository = new InvestmentsRepository();
