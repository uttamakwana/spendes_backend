import { BadRequestException } from '../../common/errors/http-exception';
import type { PaymentIntent, PaymentProvider, UpiIntentRequest } from './payment.types';

/** Money is expressed to 2 decimals in the UPI `am` parameter. */
const toAmount = (value: number): number => Math.round(value * 100) / 100;

/**
 * Builds a standard UPI deep link (`upi://pay?…`) — the no-license "Level A" path.
 * The client hands the returned `uri` to the OS, which opens the payer's installed
 * UPI app (GPay/PhonePe/…) pre-filled to pay the payee. We never see the money or a
 * confirmation here; the settlement layer reconciles via an explicit "mark as paid"
 * until a webhook-capable aggregator is wired in.
 *
 * Params are percent-encoded (spaces become `%20`, not `+`) for maximum UPI-app
 * compatibility. Spec keys used: `pa` payee VPA, `pn` payee name, `am` amount,
 * `cu` currency, `tn` note, `tr` transaction reference.
 */
export class UpiIntentProvider implements PaymentProvider {
  readonly name = 'upi_intent';

  createUpiIntent(request: UpiIntentRequest): PaymentIntent {
    const payeeVpa = request.payeeVpa?.trim();
    const payeeName = request.payeeName?.trim();
    if (!payeeVpa) {
      throw new BadRequestException('A payee UPI id (VPA) is required to build a UPI payment');
    }
    if (request.amount <= 0) {
      throw new BadRequestException('UPI payment amount must be greater than zero');
    }

    const currency = (request.currency ?? 'INR').toUpperCase();
    const amount = toAmount(request.amount);

    const enc = encodeURIComponent;
    const params = [
      `pa=${enc(payeeVpa)}`,
      `pn=${enc(payeeName || payeeVpa)}`,
      `am=${amount.toFixed(2)}`,
      `cu=${enc(currency)}`,
    ];
    if (request.note) {
      params.push(`tn=${enc(request.note)}`);
    }
    if (request.transactionRef) {
      params.push(`tr=${enc(request.transactionRef)}`);
    }

    return {
      provider: this.name,
      uri: `upi://pay?${params.join('&')}`,
      payeeVpa,
      payeeName: payeeName || payeeVpa,
      amount,
      currency,
      note: request.note,
      transactionRef: request.transactionRef,
    };
  }
}
