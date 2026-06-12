import { BaseRepository } from '../../database/base.repository';
import { WaitlistEntryModel, type WaitlistEntryDocument } from './waitlist.model';

/**
 * Data access for waitlist signups. Inherits generic CRUD + pagination; the
 * only domain-specific need is an idempotent insert-by-email.
 */
export class WaitlistRepository extends BaseRepository<WaitlistEntryDocument> {
  constructor() {
    super(WaitlistEntryModel);
  }

  /**
   * Inserts the email if it isn't on the list yet, otherwise returns the
   * existing entry untouched. Atomic (single upsert), so concurrent submissions
   * of the same email can't race the unique index.
   */
  async upsertByEmail(email: string, source: string): Promise<WaitlistEntryDocument> {
    return this.model
      .findOneAndUpdate(
        { email },
        { $setOnInsert: { email, source } },
        { new: true, upsert: true, runValidators: true },
      )
      .lean<WaitlistEntryDocument>(true)
      .exec();
  }
}

/** Shared singleton instance used across the app. */
export const waitlistRepository = new WaitlistRepository();
