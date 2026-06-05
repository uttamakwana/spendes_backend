import type { Redis } from 'ioredis';
import { createLogger } from '../logger';
import { createRedisClient } from './redis.client';

/**
 * Thin, typed wrapper around the ioredis client with JSON helpers.
 * When Redis is disabled (`REDIS_ENABLED=false`) the underlying client is null and
 * any data operation throws a clear error — guard with {@link isEnabled} first, or
 * simply leave Redis off until the caching layer is introduced.
 */
export class RedisService {
  private readonly logger = createLogger('RedisService');

  constructor(private readonly redis: Redis | null) {}

  get isEnabled(): boolean {
    return this.redis !== null;
  }

  /** Returns the raw client, or null when Redis is disabled (e.g. for pub/sub). */
  getClient(): Redis | null {
    return this.redis;
  }

  private get client(): Redis {
    if (!this.redis) {
      throw new Error('Redis is disabled. Set REDIS_ENABLED=true to use Redis-backed features.');
    }
    return this.redis;
  }

  async get(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (ttlSeconds && ttlSeconds > 0) {
      await this.client.set(key, value, 'EX', ttlSeconds);
    } else {
      await this.client.set(key, value);
    }
  }

  async getJson<T>(key: string): Promise<T | null> {
    const raw = await this.get(key);
    return raw ? (JSON.parse(raw) as T) : null;
  }

  async setJson<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    await this.set(key, JSON.stringify(value), ttlSeconds);
  }

  async del(...keys: string[]): Promise<number> {
    return this.client.del(...keys);
  }

  async exists(key: string): Promise<boolean> {
    return (await this.client.exists(key)) === 1;
  }

  async expire(key: string, ttlSeconds: number): Promise<void> {
    await this.client.expire(key, ttlSeconds);
  }

  async incr(key: string): Promise<number> {
    return this.client.incr(key);
  }

  async ttl(key: string): Promise<number> {
    return this.client.ttl(key);
  }

  async ping(): Promise<string> {
    return this.client.ping();
  }

  /** Closes the connection (used on graceful shutdown). No-op when disabled. */
  async close(): Promise<void> {
    if (this.redis) {
      await this.redis.quit();
      this.logger.info('Redis connection closed');
    }
  }
}

export const redisService = new RedisService(createRedisClient());
