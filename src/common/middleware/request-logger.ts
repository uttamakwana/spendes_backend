import { pinoHttp } from 'pino-http';
import { logger } from '../../logger';
import { REQUEST_ID_HEADER } from '../constants';

/**
 * Structured, per-request HTTP logging (Pino). Reuses the correlation id set by
 * the `requestId` middleware and redacts sensitive request fields so secrets and
 * OTPs never land in the logs.
 */
export const requestLogger = pinoHttp({
  logger,
  genReqId: (req): string => {
    const withId = req as { requestId?: string };
    if (withId.requestId) {
      return withId.requestId;
    }
    const header = req.headers[REQUEST_ID_HEADER];
    return (Array.isArray(header) ? header[0] : header) ?? '';
  },
  redact: [
    'req.headers.authorization',
    'req.headers.cookie',
    'req.body.otp',
    'req.body.refreshToken',
  ],
});
