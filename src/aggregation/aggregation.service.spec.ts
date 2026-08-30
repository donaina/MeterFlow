import { Test, TestingModule } from '@nestjs/testing';
import { AggregationService } from './aggregation.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

describe('AggregationService', () => {
  let service: AggregationService;
  let prismaService: PrismaService;
  let redisService: RedisService;
  let mockRedisClient: any;

  beforeEach(async () => {
    mockRedisClient = {
      status: 'ready',
      incrby: jest.fn().mockResolvedValue(10),
      sadd: jest.fn().mockResolvedValue(1),
      smembers: jest.fn().mockResolvedValue(['usage:cust_1:api_calls:2026-08']),
      getset: jest.fn().mockResolvedValue('10'),
      srem: jest.fn().mockResolvedValue(1),
      keys: jest.fn().mockResolvedValue(['usage:cust_1:api_calls:2026-08']),
      get: jest.fn().mockResolvedValue('5'),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AggregationService,
        {
          provide: PrismaService,
          useValue: {
            customer: {
              upsert: jest.fn().mockResolvedValue({ id: 'cust_1' }),
            },
            usageRecord: {
              findMany: jest.fn().mockResolvedValue([]),
            },
            $executeRaw: jest.fn().mockResolvedValue(1),
          },
        },
        {
          provide: RedisService,
          useValue: {
            getClient: jest.fn().mockReturnValue(mockRedisClient),
          },
        },
      ],
    }).compile();

    service = module.get<AggregationService>(AggregationService);
    prismaService = module.get<PrismaService>(PrismaService);
    redisService = module.get<RedisService>(RedisService);
  });

  it('should increment in-memory Redis counter on hot path', async () => {
    const input = {
      customerId: 'cust_1',
      featureKey: 'api_calls',
      quantity: 10,
      timestamp: '2026-08-30T10:00:00.000Z',
    };

    const result = await service.aggregateEvent(input);

    expect(result.success).toBe(true);
    expect(result.path).toBe('redis');
    expect(mockRedisClient.incrby).toHaveBeenCalledWith('usage:cust_1:api_calls:2026-08', 10);
    expect(mockRedisClient.sadd).toHaveBeenCalledWith('usage:dirty_keys', 'usage:cust_1:api_calls:2026-08');
  });

  it('should fallback to direct PostgreSQL upsert when Redis client fails', async () => {
    mockRedisClient.incrby.mockRejectedValue(new Error('Redis connection lost'));

    const input = {
      customerId: 'cust_1',
      featureKey: 'api_calls',
      quantity: 10,
      timestamp: '2026-08-30T10:00:00.000Z',
    };

    const result = await service.aggregateEvent(input);

    expect(result.success).toBe(true);
    expect(result.path).toBe('durable_fallback');
    expect(prismaService.$executeRaw).toHaveBeenCalled();
  });

  it('should flush dirty Redis counters to PostgreSQL', async () => {
    const flushResult = await service.flushCountersToDatabase();

    expect(flushResult.flushedKeysCount).toBe(1);
    expect(flushResult.syncedEventsCount).toBe(10);
    expect(mockRedisClient.getset).toHaveBeenCalledWith('usage:cust_1:api_calls:2026-08', '0');
    expect(prismaService.$executeRaw).toHaveBeenCalled();
    expect(mockRedisClient.srem).toHaveBeenCalledWith('usage:dirty_keys', 'usage:cust_1:api_calls:2026-08');
  });
});
