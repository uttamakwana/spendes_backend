import { BadRequestException } from '../../common/errors/http-exception';
import { PaymentHandleType } from '../../common/reference/countries';
import type { PaymentIntent, PaymentIntentRequest, PaymentProvider } from './payment.types';

/** Money is expressed to 2 decimals in every link rail below. */
const toAmount = (value: number): number => Math.round(value * 100) / 100;

function assertPayable(request: PaymentIntentRequest, rail: string): string {
  const handle = request.handleValue?.trim();
  if (!handle) {
    throw new BadRequestException(`A ${rail} handle is required to build this payment`);
  }
  if (request.amount <= 0) {
    throw new BadRequestException('Payment amount must be greater than zero');
  }
  return handle;
}

/**
 * PayPal.me — `https://paypal.me/<user>/<amount><CURRENCY>`. The amount suffix is
 * PayPal's own convention and pre-fills their page; it opens the PayPal app when
 * installed and the web flow otherwise, so it needs no scheme declaration.
 */
export class PayPalLinkProvider implements PaymentProvider {
  readonly name = 'paypal_link';
  readonly railLabel = 'PayPal';
  readonly handleType = PaymentHandleType.PayPal;

  /** PayPal handles every currency we support, and does its own conversion. */
  supportsCurrency(): boolean {
    return true;
  }

  createIntent(request: PaymentIntentRequest): PaymentIntent {
    const handle = assertPayable(request, 'PayPal.me').replace(/^@/, '');
    const amount = toAmount(request.amount);
    // A full paypal.me URL pasted as the handle still works — take its last segment.
    const user = handle.split('/').filter(Boolean).pop() ?? handle;

    return {
      provider: this.name,
      handleType: this.handleType,
      uri: `https://paypal.me/${encodeURIComponent(user)}/${amount}${request.currency.toUpperCase()}`,
      payeeHandle: user,
      payeeName: request.payeeName || user,
      amount,
      currency: request.currency.toUpperCase(),
      note: request.note,
      transactionRef: request.transactionRef,
      railLabel: this.railLabel,
    };
  }
}

/**
 * Venmo — the app's own `venmo://paycharge` link, which opens a pre-filled payment
 * to `recipients`. Venmo is US-only and has no web fallback worth linking to, so
 * the client declares the `venmo` scheme and falls back to showing the handle.
 */
export class VenmoLinkProvider implements PaymentProvider {
  readonly name = 'venmo_link';
  readonly railLabel = 'Venmo';
  readonly handleType = PaymentHandleType.Venmo;

  /** Venmo is US-only and settles in dollars. */
  supportsCurrency(currency: string): boolean {
    return currency.toUpperCase() === 'USD';
  }

  createIntent(request: PaymentIntentRequest): PaymentIntent {
    const handle = assertPayable(request, 'Venmo').replace(/^@/, '');
    const amount = toAmount(request.amount);
    const params = [
      'txn=pay',
      `recipients=${encodeURIComponent(handle)}`,
      `amount=${amount.toFixed(2)}`,
    ];
    if (request.note) {
      params.push(`note=${encodeURIComponent(request.note)}`);
    }

    return {
      provider: this.name,
      handleType: this.handleType,
      uri: `venmo://paycharge?${params.join('&')}`,
      payeeHandle: `@${handle}`,
      payeeName: request.payeeName || handle,
      amount,
      currency: request.currency.toUpperCase(),
      note: request.note,
      transactionRef: request.transactionRef,
      railLabel: this.railLabel,
    };
  }
}

/**
 * Cash App — `https://cash.app/$<cashtag>/<amount>`, which deep-links into the app
 * when installed. The `$` is part of the cashtag but not of the path segment, so we
 * normalise whichever form the user typed.
 */
export class CashAppLinkProvider implements PaymentProvider {
  readonly name = 'cashapp_link';
  readonly railLabel = 'Cash App';
  readonly handleType = PaymentHandleType.CashApp;

  /** Cash App settles in dollars. */
  supportsCurrency(currency: string): boolean {
    return currency.toUpperCase() === 'USD';
  }

  createIntent(request: PaymentIntentRequest): PaymentIntent {
    const handle = assertPayable(request, 'Cash App').replace(/^\$/, '');
    const amount = toAmount(request.amount);

    return {
      provider: this.name,
      handleType: this.handleType,
      uri: `https://cash.app/$${encodeURIComponent(handle)}/${amount}`,
      payeeHandle: `$${handle}`,
      payeeName: request.payeeName || handle,
      amount,
      currency: request.currency.toUpperCase(),
      note: request.note,
      transactionRef: request.transactionRef,
      railLabel: this.railLabel,
    };
  }
}

/**
 * The honest fallback: a handle we have no link for (a bank account, Revolut tag,
 * "pay me in cash"). No `uri` — the client shows the handle to copy and the payer
 * marks the settlement paid afterwards, which is what happens on every rail anyway.
 */
export class ManualHandleProvider implements PaymentProvider {
  readonly name = 'manual_handle';
  readonly railLabel = 'their payment details';
  readonly handleType = PaymentHandleType.Other;

  /** No link is built, so there is no currency to get wrong. */
  supportsCurrency(): boolean {
    return true;
  }

  createIntent(request: PaymentIntentRequest): PaymentIntent {
    const handle = assertPayable(request, 'payment');
    return {
      provider: this.name,
      handleType: this.handleType,
      payeeHandle: handle,
      payeeName: request.payeeName || handle,
      amount: toAmount(request.amount),
      currency: request.currency.toUpperCase(),
      note: request.note,
      transactionRef: request.transactionRef,
      railLabel: this.railLabel,
    };
  }
}
