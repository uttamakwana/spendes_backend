/** Injection token for the active {@link SmsProvider} implementation. */
export const SMS_PROVIDER = Symbol('SMS_PROVIDER');

export interface SmsMessage {
  /** Destination in E.164 format, e.g. `+919876543210`. */
  to: string;
  body: string;
}

/**
 * A pluggable SMS gateway. Swapping providers (Twilio, MSG91, …) means writing one
 * class against this interface and selecting it via `SMS_PROVIDER` env — no caller
 * changes. The active implementation is chosen by the factory in `auth.module.ts`.
 */
export interface SmsProvider {
  /** Provider name, for logging/diagnostics. */
  readonly name: string;
  send(message: SmsMessage): Promise<void>;
}
