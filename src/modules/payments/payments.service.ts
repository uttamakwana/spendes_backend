import { config, PaymentProviderName } from '../../config';
import { createLogger } from '../../logger';
import { UpiIntentProvider } from './upi-intent.provider';
import type { PaymentIntent, PaymentProvider, UpiIntentRequest } from './payment.types';

/**
 * Selects the active {@link PaymentProvider} from `PAYMENT_PROVIDER` config. Only
 * the UPI-intent (deep-link) rail is implemented today — add a class and a `case`
 * to ship an aggregator (Razorpay/Cashfree/…) without touching any caller. Mirrors
 * the SMS provider factory.
 */
function createPaymentProvider(): PaymentProvider {
  switch (config.payments.provider) {
    case PaymentProviderName.UpiIntent:
      return new UpiIntentProvider();
    // case PaymentProviderName.Razorpay: return new RazorpayProvider();  // wire up when integrated
    // case PaymentProviderName.Cashfree: return new CashfreeProvider();
    default:
      throw new Error(
        `Payment provider "${config.payments.provider}" is not implemented yet. Set PAYMENT_PROVIDER=upi_intent.`,
      );
  }
}

/**
 * Application-facing payments API. Delegates the actual rail to whichever
 * {@link PaymentProvider} is configured, so the settlement module depends only on
 * this seam, not on UPI specifics. Consumed by splits/settlements (built next).
 */
export class PaymentsService {
  private readonly logger = createLogger('PaymentsService');
  private readonly provider: PaymentProvider;

  constructor(provider: PaymentProvider = createPaymentProvider()) {
    this.provider = provider;
  }

  /** Builds a UPI payment instruction for a peer-to-peer settle-up. */
  createUpiIntent(request: UpiIntentRequest): PaymentIntent {
    const intent = this.provider.createUpiIntent(request);
    this.logger.debug(`UPI intent built via "${this.provider.name}" for ${request.payeeVpa}`);
    return intent;
  }
}

/** Shared singleton instance used across the app. */
export const paymentsService = new PaymentsService();
