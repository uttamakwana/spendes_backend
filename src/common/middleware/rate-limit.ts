import type { Request } from 'express';
import rateLimit, { type RateLimitRequestHandler } from 'express-rate-limit';
import { TooManyRequestsException } from '../errors/http-exception';

export interface RateLimiterOptions {
  /** Bucket key (defaults to client IP). Pass a per-user key for authenticated routes. */
  keyGenerator?: (req: Request) => string;
  /** Message returned in the 429 envelope. */
  message?: string;
}

/**
 * Builds a rate limiter that emits the app's standard error envelope (429) on
 * breach, instead of express-rate-limit's default plain response. Replaces
 * NestJS's `ThrottlerModule` / `@Throttle()`.
 *
 * @param limit          max requests allowed within the window
 * @param windowSeconds  rolling window length, in seconds
 * @param options        optional per-user keying + custom 429 message
 */
export function createRateLimiter(
  limit: number,
  windowSeconds: number,
  options: RateLimiterOptions = {},
): RateLimitRequestHandler {
  const message = options.message ?? 'Too many requests, please try again later';
  return rateLimit({
    windowMs: windowSeconds * 1_000,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    ...(options.keyGenerator ? { keyGenerator: options.keyGenerator } : {}),
    handler: (_req, _res, next) => {
      next(new TooManyRequestsException(message));
    },
  });
}
