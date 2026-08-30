import { Test, TestingModule } from '@nestjs/testing';
import { HealthController } from './health.controller';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { HttpException, HttpStatus } from '@nestjs/common';

describe('HealthController', () => {
  let controller: HealthController;
  let prismaService: PrismaService;
  let redisService: RedisService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        {
          provide: PrismaService,
          useValue: {
            ping: jest.fn(),
          },
        },
        {
          provide: RedisService,
          useValue: {
            ping: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<HealthController>(HealthController);
    prismaService = module.get<PrismaService>(PrismaService);
    redisService = module.get<RedisService>(RedisService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should return 200 OK with healthy status when DB and Redis are up', async () => {
    jest.spyOn(prismaService, 'ping').mockResolvedValue(true);
    jest.spyOn(redisService, 'ping').mockResolvedValue(true);

    const result = await controller.check();

    expect(result.status).toBe('ok');
    expect(result.info.database.status).toBe('up');
    expect(result.info.redis.status).toBe('up');
    expect(result.timestamp).toBeDefined();
  });

  it('should throw 503 Service Unavailable when DB is down', async () => {
    jest.spyOn(prismaService, 'ping').mockResolvedValue(false);
    jest.spyOn(redisService, 'ping').mockResolvedValue(true);

    try {
      await controller.check();
      fail('Expected HttpException to be thrown');
    } catch (err: any) {
      expect(err).toBeInstanceOf(HttpException);
      expect(err.getStatus()).toBe(HttpStatus.SERVICE_UNAVAILABLE);
      const res = err.getResponse();
      expect(res.status).toBe('error');
      expect(res.info.database.status).toBe('down');
      expect(res.info.redis.status).toBe('up');
    }
  });

  it('should throw 503 Service Unavailable when Redis is down', async () => {
    jest.spyOn(prismaService, 'ping').mockResolvedValue(true);
    jest.spyOn(redisService, 'ping').mockResolvedValue(false);

    try {
      await controller.check();
      fail('Expected HttpException to be thrown');
    } catch (err: any) {
      expect(err).toBeInstanceOf(HttpException);
      expect(err.getStatus()).toBe(HttpStatus.SERVICE_UNAVAILABLE);
      const res = err.getResponse();
      expect(res.status).toBe('error');
      expect(res.info.database.status).toBe('up');
      expect(res.info.redis.status).toBe('down');
    }
  });
});
