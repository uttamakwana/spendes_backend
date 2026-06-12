import { Router } from 'express';
import { createRateLimiter } from '../../common/middleware/rate-limit';
import { validate } from '../../common/middleware/validate';
import { joinWaitlist } from './waitlist.controller';
import { joinWaitlistSchema } from './waitlist.validation';

export const waitlistRouter: Router = Router();

// Public, unauthenticated endpoint — throttle harder than the global limiter
// (5 submissions per minute per IP) to keep bots from flooding the list.
waitlistRouter.post(
  '/',
  createRateLimiter(5, 60),
  validate({ body: joinWaitlistSchema }),
  joinWaitlist,
);
