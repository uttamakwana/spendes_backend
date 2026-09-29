import { z } from 'zod';

/**
 * Shared phone-number contract. The dialing code and national number are kept
 * separate (see the User model): `dialCode` is optional — the server falls back to
 * `PHONE_DEFAULT_DIAL_CODE` — while `phoneNumber` is the bare national number.
 *
 * This schema deliberately checks only the *shape* (digits, plausible length). How
 * many digits a number may have varies by country — 8 in Singapore, 10 in India and
 * the US, 11 in China — so the real rule lives in `PhoneService`, driven by the
 * country table. Hard-coding 10 here is what made the app India-only.
 *
 * `country` is optional but preferred: a dial code does not identify a country
 * (+1 is both the US and Canada, which differ in currency), so the client sends
 * what the user actually picked.
 */
export const phoneNumberSchema = z.object({
  dialCode: z
    .string()
    .regex(/^\+\d{1,4}$/, 'dialCode must look like +91')
    .optional(),
  phoneNumber: z
    .string()
    .trim()
    .regex(/^\d{4,15}$/, 'phoneNumber must be 4–15 digits, without the country code'),
  /** ISO 3166-1 alpha-2 of the country the user picked. */
  country: z
    .string()
    .trim()
    .length(2)
    .regex(/^[A-Za-z]{2}$/, 'country must be a 2-letter ISO code')
    .optional(),
});

export type PhoneNumberInput = z.infer<typeof phoneNumberSchema>;
