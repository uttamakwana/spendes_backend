import { Inject, Injectable, Logger } from '@nestjs/common';
import { SMS_PROVIDER, SmsProvider } from './sms.types';

/**
 * Application-facing SMS API. It owns message composition (so copy lives in one
 * place) and delegates delivery to whichever {@link SmsProvider} is configured.
 */
@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);

  constructor(@Inject(SMS_PROVIDER) private readonly provider: SmsProvider) {}

  async sendOtp(to: string, code: string): Promise<void> {
    const body = `${code} is your Spendes verification code. It expires shortly — do not share it with anyone.`;
    await this.provider.send({ to, body });
    this.logger.debug(`OTP dispatched via "${this.provider.name}" to ${to}`);
  }
}
