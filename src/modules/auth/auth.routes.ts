import { Router } from 'express';
import { createRateLimiter } from '../../common/middleware/rate-limit';
import { validate } from '../../common/middleware/validate';
import { authenticate } from './auth.middleware';
import { login, logout, refresh, register, requestOtp } from './auth.controller';
import {
  loginSchema,
  refreshTokenSchema,
  registerSchema,
  requestOtpSchema,
} from './auth.validation';

export const authRouter: Router = Router();

// Stricter, endpoint-specific rate limits guard the credential surface
// (mirrors the previous per-route `@Throttle()` decorators).
authRouter.post(
  '/otp/request',
  createRateLimiter(3, 60),
  validate({ body: requestOtpSchema }),
  requestOtp,
);

authRouter.post(
  '/register',
  createRateLimiter(5, 60),
  validate({ body: registerSchema }),
  register,
);

authRouter.post('/login', createRateLimiter(5, 60), validate({ body: loginSchema }), login);

authRouter.post(
  '/refresh',
  createRateLimiter(10, 60),
  validate({ body: refreshTokenSchema }),
  refresh,
);

authRouter.post('/logout', authenticate, logout);
