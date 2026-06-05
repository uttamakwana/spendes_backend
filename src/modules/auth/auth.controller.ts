import type { Request, Response } from 'express';
import { asyncHandler } from '../../common/middleware/async-handler';
import { sendSuccess } from '../../common/utils/response';
import { authService } from './auth.service';
import type {
  LoginInput,
  RefreshTokenInput,
  RegisterInput,
  RequestOtpInput,
} from './auth.validation';

/** POST /auth/otp/request — send a one-time login/registration code. */
export const requestOtp = asyncHandler(async (req: Request, res: Response) => {
  const result = await authService.requestOtp(req.body as RequestOtpInput);
  sendSuccess(res, req, result, 'Verification code sent', 200);
});

/** POST /auth/register — verify the OTP and create a new account. */
export const register = asyncHandler(async (req: Request, res: Response) => {
  const result = await authService.register(req.body as RegisterInput);
  sendSuccess(res, req, result, 'Registration successful', 201);
});

/** POST /auth/login — verify the OTP for an existing account and receive tokens. */
export const login = asyncHandler(async (req: Request, res: Response) => {
  const result = await authService.login(req.body as LoginInput);
  sendSuccess(res, req, result, 'Login successful', 200);
});

/** POST /auth/refresh — exchange a refresh token for a new token pair. */
export const refresh = asyncHandler(async (req: Request, res: Response) => {
  const { refreshToken } = req.body as RefreshTokenInput;
  const tokens = await authService.refreshTokens(refreshToken);
  sendSuccess(res, req, tokens, 'Token refreshed successfully', 200);
});

/** POST /auth/logout — revoke the refresh token for the current session. */
export const logout = asyncHandler(async (req: Request, res: Response) => {
  await authService.logout(req.user!.id);
  sendSuccess(res, req, { revoked: true }, 'Logged out successfully', 200);
});
