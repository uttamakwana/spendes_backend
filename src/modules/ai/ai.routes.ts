import { Router, type Request } from 'express';
import { config } from '../../config';
import { createRateLimiter } from '../../common/middleware/rate-limit';
import { validate } from '../../common/middleware/validate';
import { authenticate } from '../auth/auth.middleware';
import { Feature } from '../entitlements/entitlements.config';
import { requireFeature } from '../entitlements/entitlements.middleware';
import { getAiStatus, getInsights, parseExpense } from './ai.controller';
import { insightsQuerySchema, parseExpenseSchema } from './ai.validation';

export const aiRouter: Router = Router();

// Every AI route requires authentication; all reads and drafts are scoped to the caller.
aiRouter.use(authenticate);

/**
 * A per-user ceiling on the model-backed routes.
 *
 * The global throttle is keyed by IP and sized for ordinary reads; these routes cost
 * real money per call, so they are keyed by user id — one person on a shared or
 * carrier-NAT'd address must not be able to spend the budget of everyone behind it,
 * and one runaway client must not be able to spend anyone else's.
 */
const aiRateLimiter = createRateLimiter(
  config.ai.rateLimit.limit,
  config.ai.rateLimit.windowSeconds,
  {
    // `authenticate` runs first, so a user is always present; the fallback exists
    // only so this never keys on a raw IP (which express-rate-limit rightly warns
    // about, and which would defeat the point of a per-user ceiling anyway).
    keyGenerator: (req: Request) => req.user?.id ?? 'anonymous',
    message: 'You have made a lot of AI requests — please try again shortly',
  },
);

// Cheap and local: no model call, so no rate limit and no entitlement gate.
aiRouter.get('/status', getAiStatus);

// `requireFeature` is a pass-through while entitlement enforcement is off (the MVP
// default). It is attached now so these routes join the Pro tier automatically on
// the day it ships — per-call cost is exactly what a paid tier is for.
aiRouter.post(
  '/expenses/parse',
  aiRateLimiter,
  requireFeature(Feature.AiAssistant),
  validate({ body: parseExpenseSchema }),
  parseExpense,
);

aiRouter.get(
  '/insights',
  aiRateLimiter,
  requireFeature(Feature.AiAssistant),
  validate({ query: insightsQuerySchema }),
  getInsights,
);
