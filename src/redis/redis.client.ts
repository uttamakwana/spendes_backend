import Redis from 'ioredis';
import { config } from '../config';
import { createLogger } from '../logger';

const logger = createLogger('Redis');

/**
 * Creates the ioredis client from configuration, or returns `null` while
 * `REDIS_ENABLED=false` so the application runs perfectly without a Redis server
 * during early development. Flip the flag (and provide a server) to activate
 * caching, sessions, rate-limit stores, queues, etc.
 */
export function createRedisClient(): Redis | null {
  if (!config.redis.enabled) {
    logger.warn('Redis is disabled (REDIS_ENABLED=false) — Redis-backed features are inactive');
    return null;
  }

  const client = new Redis({
    host: config.redis.host,
    port: config.redis.port,
    password: config.redis.password,
    db: config.redis.db,
    keyPrefix: config.redis.keyPrefix,
    lazyConnect: false,
    maxRetriesPerRequest: 3,
    retryStrategy: (times: number) => Math.min(times * 200, 2_000),
  });

  client.on('connect', () => logger.info('Redis connection established'));
  client.on('error', (error: Error) => logger.error(`Redis error: ${error.message}`));
  client.on('close', () => logger.warn('Redis connection closed'));

  return client;
}
