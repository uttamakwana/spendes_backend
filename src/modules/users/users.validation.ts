import { z } from 'zod';
import { phoneNumberSchema } from '../../common/validation/phone.schema';

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
    // UPI VPA (e.g. `name@okhdfcbank`) used as the payee for settle-up UPI intents.
    // `plan` is intentionally NOT editable here — tier changes go through billing/admin.
    upiId: z
      .string()
      .trim()
      .regex(
        /^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z]{2,64}$/,
        'upiId must be a valid UPI id like name@bank',
      ),
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
