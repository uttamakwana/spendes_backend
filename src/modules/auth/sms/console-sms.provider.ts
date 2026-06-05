import { createLogger } from '../../../logger';
import type { SmsMessage, SmsProvider } from './sms.types';

/**
 * Development SMS provider — it does not send anything, it just logs the message.
 * This is the default gateway for the MVP; combined with `OTP_MOCK_ENABLED=true`
 * it lets you sign in with the fixed code without an SMS account. Replace by
 * setting `SMS_PROVIDER` to a real gateway once integrated.
 */
export class ConsoleSmsProvider implements SmsProvider {
  readonly name = 'console';
  private readonly logger = createLogger('ConsoleSmsProvider');

  send(message: SmsMessage): Promise<void> {
    this.logger.info(`📱 [DEV SMS] to ${message.to}: ${message.body}`);
    return Promise.resolve();
  }
}
