import rateLimit, { type RateLimitRequestHandler } from 'express-rate-limit';
import { TooManyRequestsException } from '../errors/http-exception';

/**
 * Builds a rate limiter that emits the app's standard error envelope (429) on
 * breach, instead of express-rate-limit's default plain response. Replaces
 * NestJS's `ThrottlerModule` / `@Throttle()`.
 *
 * @param limit          max requests allowed within the window
 * @param windowSeconds  rolling window length, in seconds
 */
export function createRateLimiter(limit: number, windowSeconds: number): RateLimitRequestHandler {
  return rateLimit({
    windowMs: windowSeconds * 1_000,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: (_req, _res, next) => {
      next(new TooManyRequestsException('Too many requests, please try again later'));
    },
  });
}
