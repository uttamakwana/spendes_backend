import { z } from 'zod';
import { phoneNumberSchema } from '../../common/validation/phone.schema';
import { createUserSchema } from '../users/users.validation';

const otpSchema = z.string().regex(/^\d{4,8}$/, 'otp must be 4-8 digits');

/**
 * Payload to request a one-time code. Just the phone identity — the same endpoint
 * serves both first-time (register) and returning (login) users.
 */
export const requestOtpSchema = phoneNumberSchema;
export type RequestOtpInput = z.infer<typeof requestOtpSchema>;

/**
 * First-time registration: the phone identity + profile (from {@link createUserSchema})
 * plus the OTP proving the caller controls the number.
 */
export const registerSchema = createUserSchema.extend({ otp: otpSchema });
export type RegisterInput = z.infer<typeof registerSchema>;

/**
 * Login for an existing account: phone identity + the OTP just received.
 * (Request the code first via `POST /auth/otp/request`.)
 */
export const loginSchema = phoneNumberSchema.extend({ otp: otpSchema });
export type LoginInput = z.infer<typeof loginSchema>;

/** Exchange a refresh token for a new token pair. */
export const refreshTokenSchema = z.object({
  refreshToken: z
    .string()
    .min(1)
    .regex(/^[\w-]+\.[\w-]+\.[\w-]+$/, 'refreshToken must be a valid JWT'),
});
export type RefreshTokenInput = z.infer<typeof refreshTokenSchema>;
