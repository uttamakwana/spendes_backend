import { Global, Logger, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { AppConfiguration } from '../config';
import { REDIS_CLIENT } from './redis.constants';
import { RedisService } from './redis.service';

/**
 * Global Redis infrastructure. The client is created lazily from configuration
 * and is `null` while `REDIS_ENABLED=false`, so the application runs perfectly
 * without a Redis server during early development. Flip the flag (and provide a
 * server) to activate caching, sessions, rate-limit stores, queues, etc.
 */
@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: REDIS_CLIENT,
      inject: [ConfigService],
      useFactory: (configService: ConfigService<AppConfiguration, true>): Redis | null => {
        const logger = new Logger('RedisModule');
        const redisConfig = configService.get('redis', { infer: true });

        if (!redisConfig.enabled) {
          logger.warn(
            'Redis is disabled (REDIS_ENABLED=false) — Redis-backed features are inactive',
          );
          return null;
        }

        const client = new Redis({
          host: redisConfig.host,
          port: redisConfig.port,
          password: redisConfig.password,
          db: redisConfig.db,
          keyPrefix: redisConfig.keyPrefix,
          lazyConnect: false,
          maxRetriesPerRequest: 3,
          retryStrategy: (times: number) => Math.min(times * 200, 2_000),
        });

        client.on('connect', () => logger.log('Redis connection established'));
        client.on('error', (error: Error) => logger.error(`Redis error: ${error.message}`));
        client.on('close', () => logger.warn('Redis connection closed'));

        return client;
      },
    },
    RedisService,
  ],
  exports: [RedisService, REDIS_CLIENT],
})
export class RedisModule {}
