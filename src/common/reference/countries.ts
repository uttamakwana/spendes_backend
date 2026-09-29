/**
 * The countries Spendes accepts sign-ups from, and everything that varies by
 * country in one table: dial code, phone-number shape, currency, and the settle-up
 * rail people there actually use.
 *
 * Every country-specific decision in the app reads from here, so supporting a new
 * market is one row rather than a scatter of validation and formatting edits. The
 * list is deliberately curated (not all ~250 ISO countries) — each entry is one we
 * have checked a phone rule and a currency for.
 *
 * Note that a dial code does NOT identify a country (+1 is both the US and Canada),
 * which is why `country` is stored on the user alongside `dialCode`: the phone
 * number tells us how to text someone, the country tells us how to show them money.
 */

/** How a user is paid back when settling up. */
export enum PaymentHandleType {
  /** India — a UPI VPA (`name@bank`), opened via a `upi://pay` intent. */
  Upi = 'upi',
  /** A PayPal.me username, opened as `https://paypal.me/<handle>/<amount>`. */
  PayPal = 'paypal',
  /** A Venmo username (US), opened via the `venmo://` app link. */
  Venmo = 'venmo',
  /** A Cash App $cashtag (US), opened as `https://cash.app/$<tag>/<amount>`. */
  CashApp = 'cashapp',
  /** Anything else — shown to the payer to copy; no deep link. */
  Other = 'other',
}

export interface Country {
  /** ISO 3166-1 alpha-2. */
  code: string;
  name: string;
  /** E.164 country calling code, with the leading `+`. */
  dialCode: string;
  flag: string;
  /** ISO 4217 code used as this country's default currency. */
  currency: string;
  /** Allowed national-number lengths (the part after the dial code). */
  phoneLengths: number[];
  /** Optional stricter national-number pattern. */
  phonePattern?: RegExp;
  /** The settle-up rail offered by default here. Users may pick another. */
  defaultHandle: PaymentHandleType;
  /** A representative IANA zone, used only as a fallback when the device sends none. */
  timezone: string;
}

const P = PaymentHandleType;

export const COUNTRIES: Country[] = [
  // South Asia
  {
    code: 'IN',
    name: 'India',
    dialCode: '+91',
    flag: '🇮🇳',
    currency: 'INR',
    phoneLengths: [10],
    phonePattern: /^[6-9]\d{9}$/,
    defaultHandle: P.Upi,
    timezone: 'Asia/Kolkata',
  },
  {
    code: 'PK',
    name: 'Pakistan',
    dialCode: '+92',
    flag: '🇵🇰',
    currency: 'PKR',
    phoneLengths: [10],
    defaultHandle: P.Other,
    timezone: 'Asia/Karachi',
  },
  {
    code: 'BD',
    name: 'Bangladesh',
    dialCode: '+880',
    flag: '🇧🇩',
    currency: 'BDT',
    phoneLengths: [10],
    defaultHandle: P.Other,
    timezone: 'Asia/Dhaka',
  },
  {
    code: 'LK',
    name: 'Sri Lanka',
    dialCode: '+94',
    flag: '🇱🇰',
    currency: 'LKR',
    phoneLengths: [9],
    defaultHandle: P.Other,
    timezone: 'Asia/Colombo',
  },
  {
    code: 'NP',
    name: 'Nepal',
    dialCode: '+977',
    flag: '🇳🇵',
    currency: 'NPR',
    phoneLengths: [10],
    defaultHandle: P.Other,
    timezone: 'Asia/Kathmandu',
  },

  // North America
  {
    code: 'US',
    name: 'United States',
    dialCode: '+1',
    flag: '🇺🇸',
    currency: 'USD',
    phoneLengths: [10],
    phonePattern: /^[2-9]\d{2}[2-9]\d{6}$/,
    defaultHandle: P.Venmo,
    timezone: 'America/New_York',
  },
  {
    code: 'CA',
    name: 'Canada',
    dialCode: '+1',
    flag: '🇨🇦',
    currency: 'CAD',
    phoneLengths: [10],
    phonePattern: /^[2-9]\d{2}[2-9]\d{6}$/,
    defaultHandle: P.PayPal,
    timezone: 'America/Toronto',
  },
  {
    code: 'MX',
    name: 'Mexico',
    dialCode: '+52',
    flag: '🇲🇽',
    currency: 'MXN',
    phoneLengths: [10],
    defaultHandle: P.PayPal,
    timezone: 'America/Mexico_City',
  },

  // United Kingdom & Europe
  {
    code: 'GB',
    name: 'United Kingdom',
    dialCode: '+44',
    flag: '🇬🇧',
    currency: 'GBP',
    phoneLengths: [10],
    defaultHandle: P.PayPal,
    timezone: 'Europe/London',
  },
  {
    code: 'IE',
    name: 'Ireland',
    dialCode: '+353',
    flag: '🇮🇪',
    currency: 'EUR',
    phoneLengths: [9],
    defaultHandle: P.PayPal,
    timezone: 'Europe/Dublin',
  },
  {
    code: 'DE',
    name: 'Germany',
    dialCode: '+49',
    flag: '🇩🇪',
    currency: 'EUR',
    phoneLengths: [10, 11],
    defaultHandle: P.PayPal,
    timezone: 'Europe/Berlin',
  },
  {
    code: 'FR',
    name: 'France',
    dialCode: '+33',
    flag: '🇫🇷',
    currency: 'EUR',
    phoneLengths: [9],
    defaultHandle: P.PayPal,
    timezone: 'Europe/Paris',
  },
  {
    code: 'NL',
    name: 'Netherlands',
    dialCode: '+31',
    flag: '🇳🇱',
    currency: 'EUR',
    phoneLengths: [9],
    defaultHandle: P.PayPal,
    timezone: 'Europe/Amsterdam',
  },
  {
    code: 'ES',
    name: 'Spain',
    dialCode: '+34',
    flag: '🇪🇸',
    currency: 'EUR',
    phoneLengths: [9],
    defaultHandle: P.PayPal,
    timezone: 'Europe/Madrid',
  },
  {
    code: 'IT',
    name: 'Italy',
    dialCode: '+39',
    flag: '🇮🇹',
    currency: 'EUR',
    phoneLengths: [9, 10],
    defaultHandle: P.PayPal,
    timezone: 'Europe/Rome',
  },
  {
    code: 'PT',
    name: 'Portugal',
    dialCode: '+351',
    flag: '🇵🇹',
    currency: 'EUR',
    phoneLengths: [9],
    defaultHandle: P.PayPal,
    timezone: 'Europe/Lisbon',
  },
  {
    code: 'BE',
    name: 'Belgium',
    dialCode: '+32',
    flag: '🇧🇪',
    currency: 'EUR',
    phoneLengths: [9],
    defaultHandle: P.PayPal,
    timezone: 'Europe/Brussels',
  },
  {
    code: 'CH',
    name: 'Switzerland',
    dialCode: '+41',
    flag: '🇨🇭',
    currency: 'CHF',
    phoneLengths: [9],
    defaultHandle: P.PayPal,
    timezone: 'Europe/Zurich',
  },
  {
    code: 'AT',
    name: 'Austria',
    dialCode: '+43',
    flag: '🇦🇹',
    currency: 'EUR',
    phoneLengths: [10, 11],
    defaultHandle: P.PayPal,
    timezone: 'Europe/Vienna',
  },
  {
    code: 'SE',
    name: 'Sweden',
    dialCode: '+46',
    flag: '🇸🇪',
    currency: 'SEK',
    phoneLengths: [9],
    defaultHandle: P.PayPal,
    timezone: 'Europe/Stockholm',
  },
  {
    code: 'NO',
    name: 'Norway',
    dialCode: '+47',
    flag: '🇳🇴',
    currency: 'NOK',
    phoneLengths: [8],
    defaultHandle: P.PayPal,
    timezone: 'Europe/Oslo',
  },
  {
    code: 'DK',
    name: 'Denmark',
    dialCode: '+45',
    flag: '🇩🇰',
    currency: 'DKK',
    phoneLengths: [8],
    defaultHandle: P.PayPal,
    timezone: 'Europe/Copenhagen',
  },
  {
    code: 'FI',
    name: 'Finland',
    dialCode: '+358',
    flag: '🇫🇮',
    currency: 'EUR',
    phoneLengths: [9, 10],
    defaultHandle: P.PayPal,
    timezone: 'Europe/Helsinki',
  },
  {
    code: 'PL',
    name: 'Poland',
    dialCode: '+48',
    flag: '🇵🇱',
    currency: 'PLN',
    phoneLengths: [9],
    defaultHandle: P.PayPal,
    timezone: 'Europe/Warsaw',
  },

  // Middle East
  {
    code: 'AE',
    name: 'United Arab Emirates',
    dialCode: '+971',
    flag: '🇦🇪',
    currency: 'AED',
    phoneLengths: [9],
    defaultHandle: P.Other,
    timezone: 'Asia/Dubai',
  },
  {
    code: 'SA',
    name: 'Saudi Arabia',
    dialCode: '+966',
    flag: '🇸🇦',
    currency: 'SAR',
    phoneLengths: [9],
    defaultHandle: P.Other,
    timezone: 'Asia/Riyadh',
  },
  {
    code: 'QA',
    name: 'Qatar',
    dialCode: '+974',
    flag: '🇶🇦',
    currency: 'QAR',
    phoneLengths: [8],
    defaultHandle: P.Other,
    timezone: 'Asia/Qatar',
  },
  {
    code: 'KW',
    name: 'Kuwait',
    dialCode: '+965',
    flag: '🇰🇼',
    currency: 'KWD',
    phoneLengths: [8],
    defaultHandle: P.Other,
    timezone: 'Asia/Kuwait',
  },
  {
    code: 'OM',
    name: 'Oman',
    dialCode: '+968',
    flag: '🇴🇲',
    currency: 'OMR',
    phoneLengths: [8],
    defaultHandle: P.Other,
    timezone: 'Asia/Muscat',
  },
  {
    code: 'BH',
    name: 'Bahrain',
    dialCode: '+973',
    flag: '🇧🇭',
    currency: 'BHD',
    phoneLengths: [8],
    defaultHandle: P.Other,
    timezone: 'Asia/Bahrain',
  },
  {
    code: 'IL',
    name: 'Israel',
    dialCode: '+972',
    flag: '🇮🇱',
    currency: 'ILS',
    phoneLengths: [9],
    defaultHandle: P.PayPal,
    timezone: 'Asia/Jerusalem',
  },
  {
    code: 'TR',
    name: 'Türkiye',
    dialCode: '+90',
    flag: '🇹🇷',
    currency: 'TRY',
    phoneLengths: [10],
    defaultHandle: P.PayPal,
    timezone: 'Europe/Istanbul',
  },

  // Asia Pacific
  {
    code: 'SG',
    name: 'Singapore',
    dialCode: '+65',
    flag: '🇸🇬',
    currency: 'SGD',
    phoneLengths: [8],
    defaultHandle: P.PayPal,
    timezone: 'Asia/Singapore',
  },
  {
    code: 'MY',
    name: 'Malaysia',
    dialCode: '+60',
    flag: '🇲🇾',
    currency: 'MYR',
    phoneLengths: [9, 10],
    defaultHandle: P.PayPal,
    timezone: 'Asia/Kuala_Lumpur',
  },
  {
    code: 'ID',
    name: 'Indonesia',
    dialCode: '+62',
    flag: '🇮🇩',
    currency: 'IDR',
    phoneLengths: [9, 10, 11, 12],
    defaultHandle: P.Other,
    timezone: 'Asia/Jakarta',
  },
  {
    code: 'PH',
    name: 'Philippines',
    dialCode: '+63',
    flag: '🇵🇭',
    currency: 'PHP',
    phoneLengths: [10],
    defaultHandle: P.PayPal,
    timezone: 'Asia/Manila',
  },
  {
    code: 'TH',
    name: 'Thailand',
    dialCode: '+66',
    flag: '🇹🇭',
    currency: 'THB',
    phoneLengths: [9],
    defaultHandle: P.Other,
    timezone: 'Asia/Bangkok',
  },
  {
    code: 'VN',
    name: 'Vietnam',
    dialCode: '+84',
    flag: '🇻🇳',
    currency: 'VND',
    phoneLengths: [9, 10],
    defaultHandle: P.Other,
    timezone: 'Asia/Ho_Chi_Minh',
  },
  {
    code: 'HK',
    name: 'Hong Kong',
    dialCode: '+852',
    flag: '🇭🇰',
    currency: 'HKD',
    phoneLengths: [8],
    defaultHandle: P.PayPal,
    timezone: 'Asia/Hong_Kong',
  },
  {
    code: 'JP',
    name: 'Japan',
    dialCode: '+81',
    flag: '🇯🇵',
    currency: 'JPY',
    phoneLengths: [10],
    defaultHandle: P.PayPal,
    timezone: 'Asia/Tokyo',
  },
  {
    code: 'KR',
    name: 'South Korea',
    dialCode: '+82',
    flag: '🇰🇷',
    currency: 'KRW',
    phoneLengths: [9, 10],
    defaultHandle: P.Other,
    timezone: 'Asia/Seoul',
  },
  {
    code: 'CN',
    name: 'China',
    dialCode: '+86',
    flag: '🇨🇳',
    currency: 'CNY',
    phoneLengths: [11],
    defaultHandle: P.Other,
    timezone: 'Asia/Shanghai',
  },
  {
    code: 'AU',
    name: 'Australia',
    dialCode: '+61',
    flag: '🇦🇺',
    currency: 'AUD',
    phoneLengths: [9],
    defaultHandle: P.PayPal,
    timezone: 'Australia/Sydney',
  },
  {
    code: 'NZ',
    name: 'New Zealand',
    dialCode: '+64',
    flag: '🇳🇿',
    currency: 'NZD',
    phoneLengths: [8, 9, 10],
    defaultHandle: P.PayPal,
    timezone: 'Pacific/Auckland',
  },

  // Africa & South America
  {
    code: 'ZA',
    name: 'South Africa',
    dialCode: '+27',
    flag: '🇿🇦',
    currency: 'ZAR',
    phoneLengths: [9],
    defaultHandle: P.PayPal,
    timezone: 'Africa/Johannesburg',
  },
  {
    code: 'NG',
    name: 'Nigeria',
    dialCode: '+234',
    flag: '🇳🇬',
    currency: 'NGN',
    phoneLengths: [10],
    defaultHandle: P.Other,
    timezone: 'Africa/Lagos',
  },
  {
    code: 'KE',
    name: 'Kenya',
    dialCode: '+254',
    flag: '🇰🇪',
    currency: 'KES',
    phoneLengths: [9],
    defaultHandle: P.Other,
    timezone: 'Africa/Nairobi',
  },
  {
    code: 'EG',
    name: 'Egypt',
    dialCode: '+20',
    flag: '🇪🇬',
    currency: 'EGP',
    phoneLengths: [10],
    defaultHandle: P.Other,
    timezone: 'Africa/Cairo',
  },
  {
    code: 'BR',
    name: 'Brazil',
    dialCode: '+55',
    flag: '🇧🇷',
    currency: 'BRL',
    phoneLengths: [10, 11],
    defaultHandle: P.PayPal,
    timezone: 'America/Sao_Paulo',
  },
  {
    code: 'AR',
    name: 'Argentina',
    dialCode: '+54',
    flag: '🇦🇷',
    currency: 'ARS',
    phoneLengths: [10],
    defaultHandle: P.PayPal,
    timezone: 'America/Argentina/Buenos_Aires',
  },
];

const BY_CODE = new Map(COUNTRIES.map((c) => [c.code, c]));

/** The country for an ISO code, or undefined. Case-insensitive. */
export function findCountry(code?: string | null): Country | undefined {
  return code ? BY_CODE.get(code.trim().toUpperCase()) : undefined;
}

/**
 * The countries using a dial code, most-populous first (the table's own order).
 * `+1` returns the US before Canada — a reasonable default when the client sends a
 * number but no country, and exactly why we prefer an explicit country when we can
 * get one.
 */
export function countriesForDialCode(dialCode: string): Country[] {
  return COUNTRIES.filter((c) => c.dialCode === dialCode);
}

/** The best country guess for a dial code, used only when none was supplied. */
export function countryForDialCode(dialCode: string): Country | undefined {
  return countriesForDialCode(dialCode)[0];
}

/** Every dial code we accept, deduplicated. */
export function supportedDialCodes(): string[] {
  return [...new Set(COUNTRIES.map((c) => c.dialCode))];
}
