import type { NextFunction, Request, Response } from 'express';
import { DEFAULT_REQUEST_TIMEOUT_MS } from '../constants';
import { RequestTimeoutException } from '../errors/http-exception';

/**
 * Aborts requests that exceed {@link ms}, turning a hung handler into a clean 408
 * instead of an indefinitely open connection. Replaces NestJS's `TimeoutInterceptor`.
 */
export function timeout(ms: number = DEFAULT_REQUEST_TIMEOUT_MS) {
  return (_req: Request, res: Response, next: NextFunction): void => {
    const timer = setTimeout(() => {
      if (!res.headersSent) {
        next(new RequestTimeoutException('Request processing timed out'));
      }
    }, ms);

    const clear = (): void => clearTimeout(timer);
    res.on('finish', clear);
    res.on('close', clear);

    next();
  };
}
