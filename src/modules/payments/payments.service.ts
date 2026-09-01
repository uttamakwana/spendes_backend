import { BadRequestException } from '../../common/errors/http-exception';
import { createLogger } from '../../logger';
import { PaymentHandleType } from '../../common/reference/countries';
import {
  CashAppLinkProvider,
  ManualHandleProvider,
  PayPalLinkProvider,
  VenmoLinkProvider,
} from './link-providers';
import { UpiIntentProvider } from './upi-intent.provider';
import type { PaymentIntent, PaymentIntentRequest, PaymentProvider } from './payment.types';

/**
 * The rail is chosen by the *payee's* handle, not by config: an Indian user is paid
 * over UPI and an American one over Venmo, in the same group, on the same evening.
 * Adding a market's rail means one provider class and one entry here.
 *
 * (`PAYMENT_PROVIDER` config still exists for the day UPI moves from a deep link to
 * an aggregator with webhooks — that would swap the implementation registered for
 * `upi` without touching callers.)
 */
const PROVIDERS: Record<PaymentHandleType, PaymentProvider> = {
  [PaymentHandleType.Upi]: new UpiIntentProvider(),
  [PaymentHandleType.PayPal]: new PayPalLinkProvider(),
  [PaymentHandleType.Venmo]: new VenmoLinkProvider(),
  [PaymentHandleType.CashApp]: new CashAppLinkProvider(),
  [PaymentHandleType.Other]: new ManualHandleProvider(),
};

/**
 * Application-facing payments API. Callers pass a payee handle and an amount; this
 * picks the rail and returns something the client can open (or, for an unlinkable
 * handle, show). The settlement module depends only on this seam.
 */
export class PaymentsService {
  private readonly logger = createLogger('PaymentsService');

  /** Builds a payment instruction for a peer-to-peer settle-up. */
  createIntent(request: PaymentIntentRequest): PaymentIntent {
    const provider = PROVIDERS[request.handleType] ?? PROVIDERS[PaymentHandleType.Other];

    // Spendes never converts currency, so a rail that can't carry this one would
    // send the right number in the wrong money. Refuse and let them mark it paid.
    if (!provider.supportsCurrency(request.currency)) {
      throw new BadRequestException(
        `${provider.railLabel} settles in a different currency to this ${request.currency} balance. Pay them however you normally would, then mark it as paid.`,
      );
    }

    const intent = provider.createIntent(request);
    this.logger.debug(`Payment intent built via "${provider.name}" for ${intent.payeeHandle}`);
    return intent;
  }

  /** Whether this rail can settle a balance in `currency` with a one-tap link. */
  canPay(type: PaymentHandleType, currency: string): boolean {
    const provider = PROVIDERS[type] ?? PROVIDERS[PaymentHandleType.Other];
    return this.isLinkable(type) && provider.supportsCurrency(currency);
  }

  /** The human label for a rail ("UPI", "PayPal"), for button and error copy. */
  railLabel(type: PaymentHandleType): string {
    return (PROVIDERS[type] ?? PROVIDERS[PaymentHandleType.Other]).railLabel;
  }

  /** Whether this rail produces a link the client can open. */
  isLinkable(type: PaymentHandleType): boolean {
    return type !== PaymentHandleType.Other;
  }
}

/** Shared singleton instance used across the app. */
export const paymentsService = new PaymentsService();
