import type { PaymentHandleType } from '../../common/reference/countries';

/**
 * What a settle-up payment needs: who is being paid (their handle + display name),
 * how much, and an optional note/reference for reconciliation. `amount` is a
 * major-unit value (rupees/dollars, not paise/cents).
 */
export interface PaymentIntentRequest {
  /** The payee's rail — UPI, PayPal, Venmo, Cash App, or an unlinkable handle. */
  handleType: PaymentHandleType;
  /** The handle on that rail: a VPA, a PayPal.me username, a $cashtag… */
  handleValue: string;
  /** Payee display name, shown in the payment app where the rail supports it. */
  payeeName: string;
  amount: number;
  /** ISO-4217 code. */
  currency: string;
  /** Free-text note shown to the payer, where the rail supports one. */
  note?: string;
  /** Our reference id for later reconciliation. */
  transactionRef?: string;
}

/**
 * A built payment instruction the client can act on: a deep link the OS hands to
 * the payer's app (a `upi://pay` intent, a `venmo://` link, a paypal.me URL), or —
 * for a rail we can't link into — just the handle to copy.
 *
 * Every rail here is "Level A": we hand off to someone else's app and never see the
 * money or a confirmation, which is why settlement is still recorded by an explicit
 * "mark as paid". The shape is ready for an aggregator (hosted checkout URL + order
 * id) without changing callers.
 */
export interface PaymentIntent {
  /** Provider that produced this intent (e.g. `upi_intent`, `paypal_link`). */
  provider: string;
  handleType: PaymentHandleType;
  /** The deep link / URL to open, or undefined when the rail can't be linked into. */
  uri?: string;
  /** The payee's handle, always present so the client can show it to copy. */
  payeeHandle: string;
  payeeName: string;
  amount: number;
  currency: string;
  note?: string;
  transactionRef?: string;
  /** Human label for the rail, e.g. "UPI", "PayPal" — used in button copy. */
  railLabel: string;
}

/**
 * A pluggable payment rail. Adding one (or swapping UPI deep links for an
 * aggregator with webhooks) means writing one class against this interface and
 * registering it in `payments.service.ts` — no caller changes. Mirrors the
 * `SmsProvider` pattern.
 */
export interface PaymentProvider {
  /** Provider name, for logging/diagnostics. */
  readonly name: string;
  /** Human label for the rail, shown to users ("UPI", "PayPal", "Venmo"). */
  readonly railLabel: string;
  /** The handle type this provider serves. */
  readonly handleType: PaymentHandleType;
  /**
   * Whether this rail can move the given currency. Most rails are single-currency
   * (UPI is rupees, Venmo is dollars) and Spendes never converts, so a mismatch
   * has to be refused rather than silently sending the wrong number.
   */
  supportsCurrency(currency: string): boolean;
  /** Builds a payment instruction for a peer-to-peer settle-up. */
  createIntent(request: PaymentIntentRequest): PaymentIntent;
}
