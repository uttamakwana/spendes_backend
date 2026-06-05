import type { NextFunction, Request, RequestHandler, Response } from 'express';

/**
 * Wraps an async route handler so any rejected promise is forwarded to Express's
 * error handler instead of crashing the process. Lets controllers simply `throw`
 * (e.g. `throw new NotFoundException()`), just like NestJS services did.
 *
 * @example
 * router.get('/me', asyncHandler(async (req, res) => { ... }));
 */
export const asyncHandler =
  (
    handler: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
  ): RequestHandler =>
  (req, res, next) => {
    handler(req, res, next).catch(next);
  };
