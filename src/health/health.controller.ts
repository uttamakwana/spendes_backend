import type { Request, Response } from 'express';
import mongoose from 'mongoose';
import { asyncHandler } from '../common/middleware/async-handler';
import { ServiceUnavailableException } from '../common/errors/http-exception';
import { sendSuccess } from '../common/utils/response';
import { redisService } from '../redis/redis.service';

interface IndicatorResult {
  status: 'up' | 'down';
  [key: string]: unknown;
}

const HEAP_LIMIT_BYTES = 512 * 1024 * 1024;

async function checkMongo(): Promise<IndicatorResult> {
  try {
    if (mongoose.connection.readyState !== 1 || !mongoose.connection.db) {
      return { status: 'down', message: 'not connected' };
    }
    await mongoose.connection.db.admin().ping();
    return { status: 'up' };
  } catch (error) {
    return { status: 'down', message: (error as Error).message };
  }
}

function checkMemory(): IndicatorResult {
  const heapUsed = process.memoryUsage().heapUsed;
  return {
    status: heapUsed < HEAP_LIMIT_BYTES ? 'up' : 'down',
    heapUsedMb: Math.round(heapUsed / 1024 / 1024),
    limitMb: Math.round(HEAP_LIMIT_BYTES / 1024 / 1024),
  };
}

async function checkRedis(): Promise<IndicatorResult> {
  if (!redisService.isEnabled) {
    return { status: 'up', enabled: false };
  }
  try {
    const pong = await redisService.ping();
    return { status: pong === 'PONG' ? 'up' : 'down', enabled: true };
  } catch (error) {
    return { status: 'down', enabled: true, message: (error as Error).message };
  }
}

/** GET /health — liveness/readiness probe checking MongoDB, heap memory and Redis. */
export const check = asyncHandler(async (req: Request, res: Response) => {
  const [mongodb, memory_heap, redis] = await Promise.all([
    checkMongo(),
    Promise.resolve(checkMemory()),
    checkRedis(),
  ]);

  const details: Record<string, IndicatorResult> = { mongodb, memory_heap, redis };
  const healthy = Object.values(details).every((indicator) => indicator.status === 'up');

  if (!healthy) {
    throw new ServiceUnavailableException('Service is unhealthy', details);
  }

  sendSuccess(res, req, { status: 'ok', details }, 'Service is healthy');
});
