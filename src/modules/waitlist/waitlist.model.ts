import { model, Schema, type Types } from 'mongoose';
import type { BaseDocument } from '../../database/base.repository';

/**
 * An early-access signup captured from the public landing page. Emails are
 * stored lowercased and unique so repeat submissions stay idempotent. `source`
 * records where the signup came from (landing page, referral campaign, ...)
 * for later attribution; `invitedAt` is stamped when the invite goes out.
 */
export interface WaitlistEntryDocument extends BaseDocument {
  _id: Types.ObjectId;
  email: string;
  source: string;
  invitedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const waitlistEntrySchema = new Schema<WaitlistEntryDocument>(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    source: { type: String, trim: true, default: 'landing' },
    invitedAt: { type: Date },
  },
  { timestamps: true, collection: 'waitlist' },
);

export const WaitlistEntryModel = model<WaitlistEntryDocument>(
  'WaitlistEntry',
  waitlistEntrySchema,
);
