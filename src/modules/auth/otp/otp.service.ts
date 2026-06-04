import { BadRequestException, HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { randomInt } from 'crypto';
import { AppConfiguration } from '../../../config';
import { NormalizedPhone } from '../phone/phone.service';
import { SmsService } from '../sms/sms.service';
import { OtpRepository } from './otp.repository';

export interface OtpRequestResult {
  /** Seconds until the issued code expires. */
  expiresInSeconds: number;
  /**
   * True when the code was mocked (not really sent). Lets non-prod clients show a
   * hint. The actual code is never returned over the wire.
   */
  mocked: boolean;
}

/**
 * Issues and verifies phone OTPs. Codes are bcrypt-hashed at rest, single-use,
 * expiry- and attempt-limited. While `OTP_MOCK_ENABLED` is true every code equals
 * `OTP_MOCK_CODE` (123456) and delivery is logged rather than sent — flip the flag
 * (and point `SMS_PROVIDER` at a real gateway) to go live with zero code changes.
 */
@Injectable()
export class OtpService {
  private readonly logger = new Logger(OtpService.name);
  private readonly otp: AppConfiguration['otp'];
  private readonly saltRounds: number;

  constructor(
    private readonly otpRepository: OtpRepository,
    private readonly smsService: SmsService,
    configService: ConfigService<AppConfiguration, true>,
  ) {
    this.otp = configService.get('otp', { infer: true });
    this.saltRounds = configService.get('security.bcryptSaltRounds', { infer: true });
  }

  /** Generates a fresh code for the phone, persists its hash, and dispatches it. */
  async request(phone: NormalizedPhone): Promise<OtpRequestResult> {
    await this.enforceResendCooldown(phone);

    const code = this.generateCode();
    const codeHash = await bcrypt.hash(code, this.saltRounds);
    const expiresAt = new Date(Date.now() + this.otp.ttlSeconds * 1_000);

    // Only one active code per phone — drop any prior ones before issuing.
    await this.otpRepository.deleteAllForPhone(phone.dialCode, phone.phoneNumber);
    await this.otpRepository.create({
      dialCode: phone.dialCode,
      phoneNumber: phone.phoneNumber,
      codeHash,
      expiresAt,
      attempts: 0,
    });

    await this.smsService.sendOtp(phone.e164, code);
    this.logger.log(`OTP issued for ${phone.e164} (mocked=${this.otp.mockEnabled})`);

    return { expiresInSeconds: this.otp.ttlSeconds, mocked: this.otp.mockEnabled };
  }

  /**
   * Validates a code against the active OTP for the phone. On success the code is
   * consumed (deleted) so it cannot be reused. Throws `BadRequestException` for an
   * expired/missing/incorrect code or once the attempt limit is exceeded.
   */
  async verify(phone: NormalizedPhone, code: string): Promise<void> {
    const active = await this.otpRepository.findActive(phone.dialCode, phone.phoneNumber);
    if (!active) {
      throw new BadRequestException('Verification code has expired. Please request a new one.');
    }

    if (active.attempts >= this.otp.maxAttempts) {
      await this.otpRepository.deleteAllForPhone(phone.dialCode, phone.phoneNumber);
      throw new BadRequestException('Too many incorrect attempts. Please request a new code.');
    }

    const matches = await bcrypt.compare(code, active.codeHash);
    if (!matches) {
      const attempts = await this.otpRepository.incrementAttempts(active._id.toString());
      if (attempts >= this.otp.maxAttempts) {
        await this.otpRepository.deleteAllForPhone(phone.dialCode, phone.phoneNumber);
      }
      throw new BadRequestException('Incorrect verification code.');
    }

    // Consume the code — verification succeeds exactly once.
    await this.otpRepository.deleteAllForPhone(phone.dialCode, phone.phoneNumber);
  }

  private generateCode(): string {
    if (this.otp.mockEnabled) {
      return this.otp.mockCode;
    }
    const max = 10 ** this.otp.length;
    return randomInt(0, max).toString().padStart(this.otp.length, '0');
  }

  private async enforceResendCooldown(phone: NormalizedPhone): Promise<void> {
    if (this.otp.resendCooldownSeconds <= 0) {
      return;
    }
    const latest = await this.otpRepository.findLatest(phone.dialCode, phone.phoneNumber);
    if (!latest?.createdAt) {
      return;
    }
    const elapsedMs = Date.now() - new Date(latest.createdAt).getTime();
    const waitMs = this.otp.resendCooldownSeconds * 1_000 - elapsedMs;
    if (waitMs > 0) {
      throw new HttpException(
        `Please wait ${Math.ceil(waitMs / 1_000)}s before requesting another code.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }
}
