import { type FilterQuery } from 'mongoose';
import { BaseRepository } from '../../database/base.repository';
import type { MobilePlatform } from './app.enums';
import { AppVersionModel, type AppVersionDocument } from './app-version.model';

/** Data access for the per-platform app-version config. */
export class AppVersionRepository extends BaseRepository<AppVersionDocument> {
  constructor() {
    super(AppVersionModel);
  }

  /** The config row for a platform, or null if none has been set yet. */
  findByPlatform(platform: MobilePlatform): Promise<AppVersionDocument | null> {
    return this.findOne({ platform } as FilterQuery<AppVersionDocument>);
  }

  /** Every configured platform (admin view). */
  findAllPlatforms(): Promise<AppVersionDocument[]> {
    return this.find({});
  }

  /** Creates or updates the config row for a platform in one round trip. */
  async upsertByPlatform(
    platform: MobilePlatform,
    update: Partial<Omit<AppVersionDocument, '_id' | 'platform'>>,
  ): Promise<AppVersionDocument> {
    return this.model
      .findOneAndUpdate(
        { platform } as FilterQuery<AppVersionDocument>,
        { $set: update, $setOnInsert: { platform } },
        { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true },
      )
      .lean<AppVersionDocument>(true)
      .exec();
  }
}

/** Shared singleton instance used across the app. */
export const appVersionRepository = new AppVersionRepository();
