import pino, { type Logger } from 'pino';
import { config } from './config';

/**
 * Application-wide structured logger (Pino). In non-production it pretty-prints to
 * the console; in production it emits newline-delimited JSON for log shippers.
 * Sensitive fields are redacted at the HTTP layer (see `request-logger` middleware).
 */
export const logger: Logger = pino({
  level: config.app.logLevel,
  transport: config.app.isProduction
    ? undefined
    : { target: 'pino-pretty', options: { singleLine: true, colorize: true } },
});

/**
 * Creates a child logger tagged with a `context` (e.g. a service name), so log
 * lines are attributable — the rough equivalent of NestJS's `new Logger(Name)`.
 *
 * @example
 * const log = createLogger('AuthService');
 * log.info('User logged in');
 */
export const createLogger = (context: string): Logger => logger.child({ context });
