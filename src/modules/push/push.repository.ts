import { type FilterQuery, Types } from 'mongoose';
import { BaseRepository } from '../../database/base.repository';
import { PushTokenModel, type PushTokenDocument } from './push-token.model';
import type { DevicePlatform } from './push.enums';

/**
 * Data access for device push tokens. Inherits generic CRUD from
 * {@link BaseRepository} and adds the token-keyed upsert (so reinstalls and
 * device hand-offs re-point rather than duplicate), the per-user fan-out read,
 * and the prune used to drop tokens Expo reports dead.
 */
export class PushTokensRepository extends BaseRepository<PushTokenDocument> {
  constructor() {
    super(PushTokenModel);
  }

  /** Upserts a token, (re)pointing it at `userId`. Token is unique, so this is idempotent. */
  async upsert(userId: string, token: string, platform: DevicePlatform): Promise<void> {
    await this.model
      .updateOne(
        { token },
        { $set: { userId: new Types.ObjectId(userId), platform } },
        { upsert: true },
      )
      .exec();
  }

  /** Every token for a user — the fan-out set for a single notification. */
  findByUser(userId: string): Promise<PushTokenDocument[]> {
    return this.find({ userId: new Types.ObjectId(userId) } as FilterQuery<PushTokenDocument>);
  }

  /** Removes a single token, scoped to its owner (sign-out on this device). */
  async removeOwned(userId: string, token: string): Promise<void> {
    await this.model.deleteOne({ token, userId: new Types.ObjectId(userId) }).exec();
  }

  /** Prunes tokens Expo reports as dead (`DeviceNotRegistered`). No-op when empty. */
  async removeMany(tokens: string[]): Promise<void> {
    if (tokens.length === 0) return;
    await this.model.deleteMany({ token: { $in: tokens } }).exec();
  }
}

/** Shared singleton instance used across the app. */
export const pushTokensRepository = new PushTokensRepository();
