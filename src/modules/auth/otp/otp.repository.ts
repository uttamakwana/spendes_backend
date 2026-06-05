import { BaseRepository } from '../../../database/base.repository';
import { OtpCodeModel, type OtpCodeDocument } from './otp.model';

export class OtpRepository extends BaseRepository<OtpCodeDocument> {
  constructor() {
    super(OtpCodeModel);
  }

  /** Most recently issued, still-unexpired code for a phone, or null. */
  async findActive(dialCode: string, phoneNumber: string): Promise<OtpCodeDocument | null> {
    return this.model
      .findOne({ dialCode, phoneNumber, expiresAt: { $gt: new Date() } })
      .sort({ createdAt: -1 })
      .lean<OtpCodeDocument>(true)
      .exec();
  }

  /** Most recent code regardless of expiry — used for resend-cooldown checks. */
  async findLatest(dialCode: string, phoneNumber: string): Promise<OtpCodeDocument | null> {
    return this.model
      .findOne({ dialCode, phoneNumber })
      .sort({ createdAt: -1 })
      .lean<OtpCodeDocument>(true)
      .exec();
  }

  async incrementAttempts(id: string): Promise<number> {
    const updated = await this.model
      .findByIdAndUpdate(id, { $inc: { attempts: 1 } }, { new: true })
      .lean<OtpCodeDocument>(true)
      .exec();
    return updated?.attempts ?? 0;
  }

  /** Removes every code for a phone (on success, exhaustion, or before reissue). */
  async deleteAllForPhone(dialCode: string, phoneNumber: string): Promise<void> {
    await this.model.deleteMany({ dialCode, phoneNumber }).exec();
  }
}

export const otpRepository = new OtpRepository();
