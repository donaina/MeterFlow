import { Controller, Get, HttpException, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly redisService: RedisService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'System Health & Dependency Probes' })
  @ApiResponse({ status: 200, description: 'PostgreSQL and Redis dependencies are up and healthy' })
  @ApiResponse({ status: 503, description: 'One or more dependencies are down' })
  async check() {
    const isDbUp = await this.prismaService.ping();
    const isRedisUp = await this.redisService.ping();

    const isHealthy = isDbUp && isRedisUp;
    const responsePayload = {
      status: isHealthy ? 'ok' : 'error',
      timestamp: new Date().toISOString(),
      info: {
        database: { status: isDbUp ? 'up' : 'down' },
        redis: { status: isRedisUp ? 'up' : 'down' },
      },
    };

    if (!isHealthy) {
      throw new HttpException(responsePayload, HttpStatus.SERVICE_UNAVAILABLE);
    }

    return responsePayload;
  }
}
