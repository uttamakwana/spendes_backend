/**
 * The currencies Spendes can display, with the two facts formatting actually needs:
 * the symbol, and how many minor units the currency has.
 *
 * Spendes stores one currency per record and never converts between them (a US
 * user's expenses are in dollars, an Indian user's in rupees, and a group settles
 * in its own currency), so there is no FX rate anywhere in the system — only
 * presentation varies.
 *
 * `decimals` matters for more than rounding: JPY and KRW have no minor unit, so
 * "¥1,200.00" is simply wrong, and the dinar-style currencies use three.
 */
export interface Currency {
  code: string;
  symbol: string;
  /** Minor-unit digits (2 for most, 0 for JPY/KRW, 3 for KWD/BHD/OMR). */
  decimals: number;
  /** BCP-47 locale whose digit grouping suits this currency (INR groups in lakhs). */
  locale: string;
}

const DEFAULTS = { decimals: 2, locale: 'en-US' };

export const CURRENCIES: Record<string, Currency> = {
  INR: { code: 'INR', symbol: '₹', decimals: 2, locale: 'en-IN' },
  USD: { code: 'USD', symbol: '$', ...DEFAULTS },
  CAD: { code: 'CAD', symbol: 'CA$', ...DEFAULTS },
  EUR: { code: 'EUR', symbol: '€', decimals: 2, locale: 'de-DE' },
  GBP: { code: 'GBP', symbol: '£', decimals: 2, locale: 'en-GB' },
  AUD: { code: 'AUD', symbol: 'A$', ...DEFAULTS },
  NZD: { code: 'NZD', symbol: 'NZ$', ...DEFAULTS },
  CHF: { code: 'CHF', symbol: 'CHF', decimals: 2, locale: 'de-CH' },
  SEK: { code: 'SEK', symbol: 'kr', decimals: 2, locale: 'sv-SE' },
  NOK: { code: 'NOK', symbol: 'kr', decimals: 2, locale: 'nb-NO' },
  DKK: { code: 'DKK', symbol: 'kr', decimals: 2, locale: 'da-DK' },
  PLN: { code: 'PLN', symbol: 'zł', decimals: 2, locale: 'pl-PL' },
  AED: { code: 'AED', symbol: 'AED', ...DEFAULTS },
  SAR: { code: 'SAR', symbol: 'SAR', ...DEFAULTS },
  QAR: { code: 'QAR', symbol: 'QAR', ...DEFAULTS },
  KWD: { code: 'KWD', symbol: 'KD', decimals: 3, locale: 'en-US' },
  OMR: { code: 'OMR', symbol: 'OMR', decimals: 3, locale: 'en-US' },
  BHD: { code: 'BHD', symbol: 'BD', decimals: 3, locale: 'en-US' },
  ILS: { code: 'ILS', symbol: '₪', ...DEFAULTS },
  TRY: { code: 'TRY', symbol: '₺', decimals: 2, locale: 'tr-TR' },
  SGD: { code: 'SGD', symbol: 'S$', ...DEFAULTS },
  MYR: { code: 'MYR', symbol: 'RM', ...DEFAULTS },
  IDR: { code: 'IDR', symbol: 'Rp', decimals: 0, locale: 'id-ID' },
  PHP: { code: 'PHP', symbol: '₱', ...DEFAULTS },
  THB: { code: 'THB', symbol: '฿', ...DEFAULTS },
  VND: { code: 'VND', symbol: '₫', decimals: 0, locale: 'vi-VN' },
  HKD: { code: 'HKD', symbol: 'HK$', ...DEFAULTS },
  JPY: { code: 'JPY', symbol: '¥', decimals: 0, locale: 'ja-JP' },
  KRW: { code: 'KRW', symbol: '₩', decimals: 0, locale: 'ko-KR' },
  CNY: { code: 'CNY', symbol: '¥', ...DEFAULTS },
  PKR: { code: 'PKR', symbol: '₨', decimals: 2, locale: 'en-PK' },
  BDT: { code: 'BDT', symbol: '৳', decimals: 2, locale: 'en-BD' },
  LKR: { code: 'LKR', symbol: 'Rs', decimals: 2, locale: 'en-LK' },
  NPR: { code: 'NPR', symbol: 'Rs', decimals: 2, locale: 'en-NP' },
  ZAR: { code: 'ZAR', symbol: 'R', ...DEFAULTS },
  NGN: { code: 'NGN', symbol: '₦', ...DEFAULTS },
  KES: { code: 'KES', symbol: 'KSh', ...DEFAULTS },
  EGP: { code: 'EGP', symbol: 'E£', ...DEFAULTS },
  BRL: { code: 'BRL', symbol: 'R$', decimals: 2, locale: 'pt-BR' },
  ARS: { code: 'ARS', symbol: 'AR$', decimals: 2, locale: 'es-AR' },
  MXN: { code: 'MXN', symbol: 'MX$', decimals: 2, locale: 'es-MX' },
};

/** Fallback for a code we don't carry: show the code itself rather than a wrong symbol. */
export function resolveCurrency(code?: string | null): Currency {
  const key = code?.trim().toUpperCase();
  if (key && CURRENCIES[key]) {
    return CURRENCIES[key];
  }
  return { code: key ?? 'USD', symbol: key ?? '$', decimals: 2, locale: 'en-US' };
}

/** Whether a code is one we know how to display. */
export function isSupportedCurrency(code: string): boolean {
  return Boolean(CURRENCIES[code.trim().toUpperCase()]);
}

/**
 * Renders an amount for server-side copy (notification bodies, SMS).
 *
 * Whole amounts drop the minor unit (₹1,250, not ₹1,250.00) but a fractional one
 * is padded to the currency's full precision — "$42.5" reads like a typo where
 * "$42.50" reads like money.
 */
export function formatMoney(amount: number, code?: string | null): string {
  const currency = resolveCurrency(code);
  const fractional = Math.abs(amount % 1) > Number.EPSILON;
  const value = amount.toLocaleString(currency.locale, {
    minimumFractionDigits: fractional ? currency.decimals : 0,
    maximumFractionDigits: currency.decimals,
  });
  return `${currency.symbol}${value}`;
}
