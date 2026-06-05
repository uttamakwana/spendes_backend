import type { NextFunction, Request, Response } from 'express';
import { NotFoundException } from '../errors/http-exception';

/**
 * Catch-all for unmatched routes. Registered after all routers (but before the
 * error handler) so unknown paths return the standard 404 envelope.
 */
export function notFoundHandler(req: Request, _res: Response, next: NextFunction): void {
  next(new NotFoundException(`Cannot ${req.method} ${req.originalUrl}`));
}
