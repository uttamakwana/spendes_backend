import type { Request, Response } from 'express';
import { asyncHandler } from '../../common/middleware/async-handler';
import { sendSuccess } from '../../common/utils/response';
import { AuthEventType } from './auth-event.model';
import { authEventsService, type AuthEventInput } from './auth-events.service';
import { authService } from './auth.service';
import type {
  LoginInput,
  RefreshTokenInput,
  RegisterInput,
  RequestOtpInput,
} from './auth.validation';

/** Pulls the message + status off a thrown HttpException (or anything else). */
function failure(error: unknown): Pick<AuthEventInput, 'reason' | 'statusCode'> {
  const e = error as { message?: string; statusCode?: number };
  return { reason: e?.message, statusCode: e?.statusCode };
}

/**
 * Runs an auth action and records the attempt in the auth-activity log either way.
 * The original error is always re-thrown untouched.
 */
async function tracked<T>(
  req: Request,
  base: Omit<AuthEventInput, 'success'>,
  action: () => Promise<T>,
  onSuccess?: (result: T) => Partial<AuthEventInput>,
): Promise<T> {
  try {
    const result = await action();
    authEventsService.record(req, { ...base, success: true, ...onSuccess?.(result) });
    return result;
  } catch (error) {
    authEventsService.record(req, { ...base, success: false, ...failure(error) });
    throw error;
  }
}

/** POST /auth/otp/request — send a verification code; reports whether the number is registered. */
export const requestOtp = asyncHandler(async (req: Request, res: Response) => {
  const body = req.body as RequestOtpInput;
  const result = await tracked(
    req,
    { type: AuthEventType.OtpRequested, dialCode: body.dialCode, phoneNumber: body.phoneNumber },
    () => authService.requestOtp(body),
  );
  sendSuccess(res, req, result, 'Verification code sent', 200);
});

/** POST /auth/register — verify the OTP and create a new account. */
export const register = asyncHandler(async (req: Request, res: Response) => {
  const body = req.body as RegisterInput;
  const result = await tracked(
    req,
    { type: AuthEventType.Register, dialCode: body.dialCode, phoneNumber: body.phoneNumber },
    () => authService.register(body),
    (r) => ({ userId: r.user.id }),
  );
  sendSuccess(res, req, result, 'Registration successful', 201);
});

/** POST /auth/login — verify the OTP and sign in to an existing account. */
export const login = asyncHandler(async (req: Request, res: Response) => {
  const body = req.body as LoginInput;
  const result = await tracked(
    req,
    { type: AuthEventType.Login, dialCode: body.dialCode, phoneNumber: body.phoneNumber },
    () => authService.login(body),
    (r) => ({ userId: r.user.id }),
  );
  sendSuccess(res, req, result, 'Login successful', 200);
});

/** POST /auth/refresh — rotate the token pair. Only failures are logged (successes are noise). */
export const refresh = asyncHandler(async (req: Request, res: Response) => {
  const { refreshToken } = req.body as RefreshTokenInput;
  let tokens;
  try {
    tokens = await authService.refreshTokens(refreshToken);
  } catch (error) {
    authEventsService.record(req, {
      type: AuthEventType.Refresh,
      success: false,
      ...failure(error),
    });
    throw error;
  }
  sendSuccess(res, req, tokens, 'Token refreshed successfully', 200);
});

/** POST /auth/logout — revoke the stored refresh token. */
export const logout = asyncHandler(async (req: Request, res: Response) => {
  await authService.logout(req.user!.id);
  authEventsService.record(req, {
    type: AuthEventType.Logout,
    success: true,
    userId: req.user!.id,
    phoneNumber: req.user!.phoneNumber,
  });
  sendSuccess(res, req, { revoked: true }, 'Logged out successfully', 200);
});
