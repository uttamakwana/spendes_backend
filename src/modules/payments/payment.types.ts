/**
 * What a settle-up payment needs in order to build a UPI request: who is being
 * paid (their VPA + display name), how much, and optional note/reference for
 * reconciliation. `amount` is a major-unit value (rupees, not paise).
 */
export interface UpiIntentRequest {
  /** Payee UPI VPA / id, e.g. `someone@okaxis`. */
  payeeVpa: string;
  /** Payee display name shown in the UPI app. */
  payeeName: string;
  amount: number;
  /** ISO-4217 code; defaults to INR. */
  currency?: string;
  /** Free-text note shown to the payer (`tn`). */
  note?: string;
  /** Our reference id for later reconciliation (`tr`). */
  transactionRef?: string;
}

/**
 * A built payment instruction the client can act on. Today that is purely a UPI
 * deep link (Level A — the client hands `uri` to the OS, which opens the user's
 * installed UPI app); once a payment aggregator is integrated this same shape can
 * carry a hosted checkout URL + order id instead, without changing callers.
 */
export interface PaymentIntent {
  /** Provider that produced this intent (e.g. `upi_intent`). */
  provider: string;
  /** The `upi://pay?…` deep link to open the payer's UPI app. */
  uri: string;
  payeeVpa: string;
  payeeName: string;
  amount: number;
  currency: string;
  note?: string;
  transactionRef?: string;
}

/**
 * A pluggable payment backend. Swapping the rail (UPI intent → an aggregator like
 * Razorpay/Cashfree with webhooks) means writing one class against this interface
 * and selecting it via `PAYMENT_PROVIDER` env — no caller changes. The active
 * implementation is chosen by the factory in `payments.service.ts`. Mirrors the
 * `SmsProvider` pattern. Aggregator-only capabilities (server-side collect
 * requests, webhook verification) get added to this interface when integrated.
 */
export interface PaymentProvider {
  /** Provider name, for logging/diagnostics. */
  readonly name: string;
  /** Builds a UPI payment instruction for a peer-to-peer settle-up. */
  createUpiIntent(request: UpiIntentRequest): PaymentIntent;
}
