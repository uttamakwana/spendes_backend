import { config, SmsProviderName } from '../../../config';
import { createLogger } from '../../../logger';
import { ConsoleSmsProvider } from './console-sms.provider';
import type { SmsProvider } from './sms.types';

/**
 * Selects the active {@link SmsProvider} from `SMS_PROVIDER` config. Only the
 * console (dev) gateway is implemented today — add a class and a `case` to ship a
 * real one without touching any caller. Replaces the provider factory that lived
 * in NestJS's `auth.module.ts`.
 */
function createSmsProvider(): SmsProvider {
  switch (config.sms.provider) {
    case SmsProviderName.Console:
      return new ConsoleSmsProvider();
    // case SmsProviderName.Twilio: return new TwilioSmsProvider();  // wire up when integrated
    // case SmsProviderName.Msg91:  return new Msg91SmsProvider();
    default:
      throw new Error(
        `SMS provider "${config.sms.provider}" is not implemented yet. Set SMS_PROVIDER=console.`,
      );
  }
}

/**
 * Application-facing SMS API. It owns message composition (so copy lives in one
 * place) and delegates delivery to whichever {@link SmsProvider} is configured.
 */
export class SmsService {
  private readonly logger = createLogger('SmsService');
  private readonly provider: SmsProvider;

  constructor(provider: SmsProvider = createSmsProvider()) {
    this.provider = provider;
  }

  async sendOtp(to: string, code: string): Promise<void> {
    const body = `${code} is your Spendes verification code. It expires shortly — do not share it with anyone.`;
    await this.provider.send({ to, body });
    this.logger.debug(`OTP dispatched via "${this.provider.name}" to ${to}`);
  }
}

export const smsService = new SmsService();
