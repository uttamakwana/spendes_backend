import { config } from '../../../config';
import { BadRequestException } from '../../../common/errors/http-exception';

/** A validated, normalized phone identity. */
export interface NormalizedPhone {
  dialCode: string;
  phoneNumber: string;
  /** Full E.164 string, e.g. `+919876543210`. */
  e164: string;
}

/** Per-country national-number rule. Add entries here as we expand globally. */
interface DialCodeRule {
  /** Exact allowed lengths of the national number. */
  lengths: number[];
  /** Optional stricter pattern (e.g. Indian mobiles start 6-9). */
  pattern?: RegExp;
}

/**
 * Centralizes phone normalization and validation so the rest of the app deals in
 * a clean (dialCode, phoneNumber) pair. The set of accepted dial codes is config
 * driven (`PHONE_ALLOWED_DIAL_CODES`) — India-only for the MVP, `*` for global —
 * and the per-country digit rules live in {@link RULES}, so going worldwide is a
 * config + table change, not a scatter of validation edits.
 */
export class PhoneService {
  private static readonly DEFAULT_RULE: DialCodeRule = { lengths: [6, 7, 8, 9, 10, 11, 12] };

  private static readonly RULES: Record<string, DialCodeRule> = {
    '+91': { lengths: [10], pattern: /^[6-9]\d{9}$/ },
  };

  private readonly defaultDialCode = config.phone.defaultDialCode;
  private readonly allowedDialCodes = config.phone.allowedDialCodes;

  /**
   * Resolves the dial code (falling back to the configured default), strips any
   * separators from the number, enforces the allow-list and the per-country rule,
   * and returns the normalized identity. Throws `BadRequestException` on any miss.
   */
  normalize(input: { dialCode?: string; phoneNumber: string }): NormalizedPhone {
    const dialCode = (input.dialCode ?? this.defaultDialCode).trim();
    const phoneNumber = input.phoneNumber.replace(/[\s-]/g, '').trim();

    if (!/^\+\d{1,4}$/.test(dialCode)) {
      throw new BadRequestException('Invalid country dialing code');
    }
    if (!this.isDialCodeAllowed(dialCode)) {
      throw new BadRequestException(
        `Phone numbers from ${dialCode} are not supported yet. Currently available in India (+91) only.`,
      );
    }

    const rule = PhoneService.RULES[dialCode] ?? PhoneService.DEFAULT_RULE;
    if (!/^\d+$/.test(phoneNumber) || !rule.lengths.includes(phoneNumber.length)) {
      throw new BadRequestException('Phone number is not valid for the selected country');
    }
    if (rule.pattern && !rule.pattern.test(phoneNumber)) {
      throw new BadRequestException('Phone number is not valid for the selected country');
    }

    return { dialCode, phoneNumber, e164: `${dialCode}${phoneNumber}` };
  }

  private isDialCodeAllowed(dialCode: string): boolean {
    if (this.allowedDialCodes === '*') {
      return true;
    }
    return Array.isArray(this.allowedDialCodes) && this.allowedDialCodes.includes(dialCode);
  }
}

export const phoneService = new PhoneService();
