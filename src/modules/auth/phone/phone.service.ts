import { config } from '../../../config';
import { BadRequestException } from '../../../common/errors/http-exception';
import {
  COUNTRIES,
  countriesForDialCode,
  findCountry,
  type Country,
} from '../../../common/reference/countries';

/** A validated, normalized phone identity. */
export interface NormalizedPhone {
  dialCode: string;
  phoneNumber: string;
  /** Full E.164 string, e.g. `+919876543210`. */
  e164: string;
  /** The resolved ISO country, when the dial code identifies one unambiguously. */
  country?: Country;
}

/**
 * Centralizes phone normalization and validation so the rest of the app deals in a
 * clean (dialCode, phoneNumber) pair. Per-country rules come from the shared
 * {@link COUNTRIES} table, so adding a market is a row there rather than an edit
 * here, and `PHONE_ALLOWED_DIAL_CODES` narrows that set when we want to open a
 * country at a time (`*` — the default — means every country in the table).
 *
 * A caller may pass the ISO `country` alongside the number. That matters wherever a
 * dial code is shared: +1 is both the US and Canada, and the two differ in currency
 * even though the number validates identically.
 */
export class PhoneService {
  /** Used for a dial code we accept but hold no explicit rule for. */
  private static readonly DEFAULT_LENGTHS = [6, 7, 8, 9, 10, 11, 12];

  private readonly defaultDialCode = config.phone.defaultDialCode;
  private readonly allowedDialCodes = config.phone.allowedDialCodes;

  /**
   * Resolves the dial code (falling back to the configured default), strips any
   * separators from the number, enforces the allow-list and the country rule, and
   * returns the normalized identity. Throws `BadRequestException` on any miss.
   */
  normalize(input: { dialCode?: string; phoneNumber: string; country?: string }): NormalizedPhone {
    const dialCode = (input.dialCode ?? this.defaultDialCode).trim();
    const phoneNumber = input.phoneNumber.replace(/[\s()-]/g, '').trim();

    if (!/^\+\d{1,4}$/.test(dialCode)) {
      throw new BadRequestException('Invalid country dialing code');
    }
    if (!this.isDialCodeAllowed(dialCode)) {
      throw new BadRequestException(
        `Spendes isn't available for ${dialCode} numbers yet. Pick another country, or let us know and we'll add it.`,
      );
    }

    const country = this.resolveCountry(dialCode, input.country);
    const lengths = country?.phoneLengths ?? PhoneService.DEFAULT_LENGTHS;

    if (!/^\d+$/.test(phoneNumber) || !lengths.includes(phoneNumber.length)) {
      throw new BadRequestException(
        country
          ? `That doesn't look like a ${country.name} phone number.`
          : 'Phone number is not valid for the selected country',
      );
    }
    // A shared dial code means several candidate patterns; the number only has to
    // satisfy one of them (a +1 number is valid if it's valid as US *or* Canadian).
    const candidates = input.country && country ? [country] : countriesForDialCode(dialCode);
    const patterns = candidates.map((c) => c.phonePattern).filter(Boolean) as RegExp[];
    if (patterns.length > 0 && !patterns.some((p) => p.test(phoneNumber))) {
      throw new BadRequestException(
        country
          ? `That doesn't look like a ${country.name} phone number.`
          : 'Phone number is not valid for the selected country',
      );
    }

    return { dialCode, phoneNumber, e164: `${dialCode}${phoneNumber}`, country };
  }

  /**
   * The country behind a sign-up: what the client told us when it can (the picker
   * knows whether the user chose the US or Canada), falling back to the first
   * country on that dial code.
   */
  resolveCountry(dialCode: string, code?: string): Country | undefined {
    const explicit = findCountry(code);
    if (explicit && explicit.dialCode === dialCode) {
      return explicit;
    }
    return countriesForDialCode(dialCode)[0];
  }

  private isDialCodeAllowed(dialCode: string): boolean {
    if (this.allowedDialCodes === '*') {
      // Still bounded by the table — an unknown dial code is not a supported market.
      return COUNTRIES.some((c) => c.dialCode === dialCode);
    }
    return Array.isArray(this.allowedDialCodes) && this.allowedDialCodes.includes(dialCode);
  }
}

export const phoneService = new PhoneService();
