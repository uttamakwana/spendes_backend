import { type FilterQuery, Types } from 'mongoose';
import { BaseRepository } from '../../database/base.repository';
import { InsightModel, type InsightDocument } from './insight.model';

/** Everything a generation writes — identity (`userId`, `periodKey`) is supplied separately. */
export type InsightFields = Pick<
  InsightDocument,
  | 'periodStart'
  | 'periodEnd'
  | 'currency'
  | 'headline'
  | 'items'
  | 'suggestions'
  | 'brief'
  | 'fingerprint'
  | 'source'
  | 'model'
  | 'generatedAt'
>;

/**
 * Data access for stored monthly summaries. Inherits generic CRUD from
 * {@link BaseRepository} and adds the two operations this feature actually needs:
 * read one month, and replace one month.
 */
export class InsightsRepository extends BaseRepository<InsightDocument> {
  constructor() {
    super(InsightModel);
  }

  /** The stored summary for a user's month, or null if none has been generated. */
  findForPeriod(userId: string, periodKey: string): Promise<InsightDocument | null> {
    return this.findOne({
      userId: new Types.ObjectId(userId),
      periodKey,
    } as FilterQuery<InsightDocument>);
  }

  /**
   * Writes the month's summary, replacing any previous generation for that month.
   * An upsert rather than a create because a month is regenerated whenever its
   * figures move, and two concurrent dashboard loads must not race into duplicates
   * — the unique `(userId, periodKey)` index makes that a no-op rather than an error.
   */
  async saveForPeriod(
    userId: string,
    periodKey: string,
    fields: InsightFields,
  ): Promise<InsightDocument> {
    const saved = await this.model
      .findOneAndUpdate(
        { userId: new Types.ObjectId(userId), periodKey } as FilterQuery<InsightDocument>,
        { $set: { ...fields, userId: new Types.ObjectId(userId), periodKey } },
        { new: true, upsert: true, runValidators: true },
      )
      .lean<InsightDocument>(true)
      .exec();

    return saved;
  }
}

/** Shared singleton instance used across the app. */
export const insightsRepository = new InsightsRepository();
