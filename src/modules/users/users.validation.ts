import { z } from 'zod';
import { phoneNumberSchema } from '../../common/validation/phone.schema';
import { findCountry, PaymentHandleType } from '../../common/reference/countries';

/** A UPI VPA (`name@bank`). */
const UPI_VPA = /^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z]{2,64}$/;
/** A username-shaped handle: PayPal.me, Venmo, Cash App tags all fit this. */
const USERNAME_HANDLE = /^[a-zA-Z0-9._-]{2,64}$/;

/**
 * Where settle-up money should go: the rail, and the handle on it. Validated per
 * rail so a mistyped VPA is caught the same way a mistyped Venmo name is, and
 * shared by registration and profile updates so the two can't drift apart.
 *
 * `other` is the escape hatch for a rail we don't link into (a bank reference, a
 * Revolut tag) — it only has to be non-empty, because we're going to show it to a
 * human rather than build a URL from it.
 */
export const paymentHandleSchema = z
  .object({
    type: z.nativeEnum(PaymentHandleType),
    value: z.string().trim().min(2).max(256),
  })
  .superRefine((handle, ctx) => {
    const fail = (message: string) =>
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['value'], message });

    switch (handle.type) {
      case PaymentHandleType.Upi:
        if (!UPI_VPA.test(handle.value)) fail('Enter a UPI id like name@okhdfcbank');
        break;
      case PaymentHandleType.PayPal:
        // A full paypal.me URL is fine too — we take the username from it.
        if (!USERNAME_HANDLE.test(handle.value.split('/').filter(Boolean).pop() ?? '')) {
          fail('Enter your PayPal.me username, e.g. janedoe');
        }
        break;
      case PaymentHandleType.Venmo:
        if (!USERNAME_HANDLE.test(handle.value.replace(/^@/, ''))) {
          fail('Enter your Venmo username, e.g. @jane-doe');
        }
        break;
      case PaymentHandleType.CashApp:
        if (!USERNAME_HANDLE.test(handle.value.replace(/^\$/, ''))) {
          fail('Enter your $cashtag, e.g. $janedoe');
        }
        break;
      case PaymentHandleType.Other:
      default:
        break;
    }
  });

/** ISO 3166-1 alpha-2, restricted to the markets we actually support. */
export const countrySchema = z
  .string()
  .trim()
  .toUpperCase()
  .refine((code) => Boolean(findCountry(code)), 'Spendes is not available in that country yet');

/**
 * An IANA zone name. Validated by asking Intl to use it rather than by pattern —
 * the list changes with the tz database, and the runtime is the authority.
 */
export const timezoneSchema = z
  .string()
  .trim()
  .max(64)
  .refine((tz) => {
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: tz });
      return true;
    } catch {
      return false;
    }
  }, 'Not a valid IANA timezone');

/**
 * Profile data captured when an account is first created (after OTP verification).
 * Inherits `dialCode` + `phoneNumber` from {@link phoneNumberSchema}. There is no
 * password — authentication is OTP-based.
 */
export const createUserSchema = phoneNumberSchema.extend({
  firstName: z.string().trim().min(1).max(50),
  lastName: z.string().trim().min(1).max(50),
  email: z.string().email().optional(),
  defaultCurrency: z.string().length(3).optional(),
  /** ISO country from the sign-up picker; falls back to the dial code's country. */
  country: countrySchema.optional(),
  /** The device's IANA zone, so budgets and analytics use the user's own month. */
  timezone: timezoneSchema.optional(),
  // Optional at sign-up: collecting it here means friends can settle up with the
  // user from day one, but nothing about the account depends on it.
  paymentHandle: paymentHandleSchema.optional(),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;

/**
 * Profile-update payload (`PATCH /users/me`). Phone number and dial code are
 * intentionally excluded — changing the primary identity is a security-sensitive,
 * OTP re-verified flow rather than a plain profile edit.
 */
export const updateUserSchema = z
  .object({
    firstName: z.string().trim().min(1).max(50),
    lastName: z.string().trim().min(1).max(50),
    email: z.string().email(),
    avatarUrl: z.string().url(),
    defaultCurrency: z.string().length(3),
    country: countrySchema,
    timezone: timezoneSchema,
    // Where settle-up money goes. `plan` is intentionally NOT editable here — tier
    // changes go through billing/admin.
    paymentHandle: paymentHandleSchema,
  })
  .partial();

export type UpdateUserInput = z.infer<typeof updateUserSchema>;

/**
 * Notification-preference update (`PATCH /users/me/notification-preferences`).
 * Partial: send only the keys you're changing. These gate *push* delivery only —
 * the in-app inbox always records activity.
 */
export const updateNotificationPreferencesSchema = z
  .object({
    reminders: z.boolean(),
    splits: z.boolean(),
    budgets: z.boolean(),
    summary: z.boolean(),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, {
    message: 'Provide at least one preference to update',
  });

export type UpdateNotificationPreferencesInput = z.infer<
  typeof updateNotificationPreferencesSchema
>;
