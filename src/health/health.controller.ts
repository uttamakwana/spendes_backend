import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  HealthCheck,
  HealthCheckService,
  HealthIndicatorResult,
  MemoryHealthIndicator,
  MongooseHealthIndicator,
} from '@nestjs/terminus';
import { Public, ResponseMessage } from '../common/decorators';
import { RedisService } from '../redis/redis.service';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly mongoose: MongooseHealthIndicator,
    private readonly memory: MemoryHealthIndicator,
    private readonly redisService: RedisService,
  ) {}

  /** Liveness/readiness probe — checks MongoDB, heap memory and Redis. */
  @Public()
  @Get()
  @HealthCheck()
  @ResponseMessage('Service is healthy')
  check() {
    return this.health.check([
      () => this.mongoose.pingCheck('mongodb'),
      () => this.memory.checkHeap('memory_heap', 512 * 1024 * 1024),
      () => this.checkRedis(),
    ]);
  }

  private async checkRedis(): Promise<HealthIndicatorResult> {
    if (!this.redisService.isEnabled) {
      return { redis: { status: 'up', enabled: false } };
    }

    try {
      const pong = await this.redisService.ping();
      return { redis: { status: pong === 'PONG' ? 'up' : 'down', enabled: true } };
    } catch (error) {
      return { redis: { status: 'down', message: (error as Error).message } };
    }
  }
}
