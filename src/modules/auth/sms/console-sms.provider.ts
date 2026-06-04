import { Injectable, Logger } from '@nestjs/common';
import { SmsMessage, SmsProvider } from './sms.types';

/**
 * Development SMS provider — it does not send anything, it just logs the message.
 * This is the default gateway for the MVP; combined with `OTP_MOCK_ENABLED=true`
 * it lets you sign in with the fixed code without an SMS account. Replace by
 * setting `SMS_PROVIDER` to a real gateway once integrated.
 */
@Injectable()
export class ConsoleSmsProvider implements SmsProvider {
  readonly name = 'console';
  private readonly logger = new Logger(ConsoleSmsProvider.name);

  send(message: SmsMessage): Promise<void> {
    this.logger.log(`📱 [DEV SMS] to ${message.to}: ${message.body}`);
    return Promise.resolve();
  }
}
