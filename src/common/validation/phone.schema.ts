import { z } from 'zod';

/**
 * Shared phone-number contract. The dialing code and national number are kept
 * separate (see the User model). `dialCode` is optional — the server falls back to
 * `PHONE_DEFAULT_DIAL_CODE` (+91) — while `phoneNumber` is the bare national number.
 * The 10-digit rule is the India MVP gate; per-country rules that vary by length
 * live in `PhoneService`, so widening this schema is not needed to go global.
 */
export const phoneNumberSchema = z.object({
  dialCode: z
    .string()
    .regex(/^\+\d{1,4}$/, 'dialCode must look like +91')
    .optional(),
  phoneNumber: z.string().regex(/^\d{10}$/, 'phoneNumber must be exactly 10 digits'),
});

export type PhoneNumberInput = z.infer<typeof phoneNumberSchema>;
