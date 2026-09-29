import { config } from '../../../config';
import { createLogger } from '../../../logger';
import type { SmsProvider, SmsMessage } from './sms.types';

/**
 * Twilio's Programmable Messaging REST API, called directly over `fetch` — the
 * whole integration is one authenticated form POST, so the SDK would be a
 * dependency and a build-size cost for nothing.
 *
 * Twilio is the provider that makes Spendes work outside India: it delivers to
 * effectively every country, which a domestic Indian gateway (MSG91 and friends)
 * does not. Set `SMS_PROVIDER=twilio` with an account SID, an auth token, and
 * either a `TWILIO_MESSAGING_SERVICE_SID` (recommended — Twilio then picks the
 * right sender per destination country) or a single `SMS_FROM` number.
 *
 * Sending is best-effort from the caller's perspective: `OtpService` already treats
 * a delivery failure as a failed OTP request, so a thrown error here surfaces to
 * the user as "we couldn't text you" rather than a silent dead end.
 */
export class TwilioSmsProvider implements SmsProvider {
  readonly name = 'twilio';

  private readonly accountSid = config.sms.twilio.accountSid;
  private readonly authToken = config.sms.twilio.authToken;
  private readonly messagingServiceSid = config.sms.twilio.messagingServiceSid;
  private readonly from = config.sms.from;
  private readonly logger = createLogger('TwilioSmsProvider');

  constructor() {
    if (!this.accountSid || !this.authToken) {
      throw new Error(
        'SMS_PROVIDER=twilio requires TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN to be set.',
      );
    }
    if (!this.messagingServiceSid && !this.from.startsWith('+')) {
      throw new Error(
        'SMS_PROVIDER=twilio requires either TWILIO_MESSAGING_SERVICE_SID or an E.164 SMS_FROM number (an alphanumeric sender id is not accepted in every country).',
      );
    }
  }

  async send(message: SmsMessage): Promise<void> {
    const body = new URLSearchParams({ To: message.to, Body: message.body });
    // A messaging service lets Twilio choose a compliant sender for the
    // destination country; a bare `From` number is the single-country fallback.
    if (this.messagingServiceSid) {
      body.set('MessagingServiceSid', this.messagingServiceSid);
    } else {
      body.set('From', this.from);
    }

    const auth = Buffer.from(`${this.accountSid}:${this.authToken}`).toString('base64');
    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${this.accountSid}/Messages.json`,
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: body.toString(),
      },
    );

    if (!response.ok) {
      // Twilio returns a JSON error body; surface its message, not a bare status.
      const detail = await response.text().catch(() => '');
      this.logger.error(`Twilio send failed (${response.status}): ${detail}`);
      throw new Error(`SMS delivery failed with status ${response.status}`);
    }
  }
}
