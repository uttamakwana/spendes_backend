import { randomUUID } from 'crypto';
import type { NextFunction, Request, Response } from 'express';
import { REQUEST_ID_HEADER } from '../constants';

/**
 * Assigns a correlation id to every request (reusing an inbound `x-request-id`
 * when present), exposes it as `req.requestId`, and echoes it back on the response
 * so clients and logs can be correlated end-to-end.
 */
export function requestId(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers[REQUEST_ID_HEADER];
  const incoming = Array.isArray(header) ? header[0] : header;
  const id = incoming && incoming.trim() ? incoming : randomUUID();

  req.requestId = id;
  res.setHeader(REQUEST_ID_HEADER, id);
  next();
}
