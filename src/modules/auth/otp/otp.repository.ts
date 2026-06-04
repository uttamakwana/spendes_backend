import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AbstractRepository } from '../../../database/abstract.repository';
import { OtpCode } from './schemas/otp-code.schema';

@Injectable()
export class OtpRepository extends AbstractRepository<OtpCode> {
  protected readonly logger = new Logger(OtpRepository.name);

  constructor(@InjectModel(OtpCode.name) otpModel: Model<OtpCode>) {
    super(otpModel);
  }

  /** Most recently issued, still-unexpired code for a phone, or null. */
  async findActive(dialCode: string, phoneNumber: string): Promise<OtpCode | null> {
    return this.model
      .findOne({ dialCode, phoneNumber, expiresAt: { $gt: new Date() } })
      .sort({ createdAt: -1 })
      .lean<OtpCode>(true)
      .exec();
  }

  /** Most recent code regardless of expiry — used for resend-cooldown checks. */
  async findLatest(dialCode: string, phoneNumber: string): Promise<OtpCode | null> {
    return this.model
      .findOne({ dialCode, phoneNumber })
      .sort({ createdAt: -1 })
      .lean<OtpCode>(true)
      .exec();
  }

  async incrementAttempts(id: string): Promise<number> {
    const updated = await this.model
      .findByIdAndUpdate(id, { $inc: { attempts: 1 } }, { new: true })
      .lean<OtpCode>(true)
      .exec();
    return updated?.attempts ?? 0;
  }

  /** Removes every code for a phone (on success, exhaustion, or before reissue). */
  async deleteAllForPhone(dialCode: string, phoneNumber: string): Promise<void> {
    await this.model.deleteMany({ dialCode, phoneNumber }).exec();
  }
}
