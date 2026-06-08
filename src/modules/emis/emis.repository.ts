import { type FilterQuery, Types, type UpdateQuery } from 'mongoose';
import { BaseRepository } from '../../database/base.repository';
import { EmiModel, type EmiDocument } from './emis.model';

/**
 * Data access for recurring obligations. Inherits generic CRUD + pagination and adds
 * owner-scoped lookups so a user can only ever touch their own EMIs.
 */
export class EmisRepository extends BaseRepository<EmiDocument> {
  constructor() {
    super(EmiModel);
  }

  /** Fetches an EMI by id only if it belongs to `userId`; throws 404 otherwise. */
  findOwnedByIdOrThrow(id: string, userId: string): Promise<EmiDocument> {
    return this.findOneOrThrow({ _id: id, userId } as FilterQuery<EmiDocument>);
  }

  /** Updates an EMI in place, scoped to its owner; throws 404 if not found/owned. */
  updateOwned(id: string, userId: string, update: UpdateQuery<EmiDocument>): Promise<EmiDocument> {
    return this.findOneAndUpdate({ _id: id, userId } as FilterQuery<EmiDocument>, update);
  }

  /** Deletes an EMI, scoped to its owner; throws 404 if not found/owned. */
  deleteOwned(id: string, userId: string): Promise<EmiDocument> {
    return this.deleteOne({ _id: id, userId } as FilterQuery<EmiDocument>);
  }

  /** All of a user's active obligations (used to compute the commitment summary). */
  findActiveForUser(userId: string): Promise<EmiDocument[]> {
    return this.find({
      userId: new Types.ObjectId(userId),
      isActive: true,
    } as FilterQuery<EmiDocument>);
  }
}

/** Shared singleton instance used across the app. */
export const emisRepository = new EmisRepository();
