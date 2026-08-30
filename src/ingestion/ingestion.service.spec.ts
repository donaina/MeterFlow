import { Test, TestingModule } from '@nestjs/testing';
import { IngestionService } from './ingestion.service';
import { PrismaService } from '../prisma/prisma.service';
import { AggregationService } from '../aggregation/aggregation.service';
import { Prisma } from '@prisma/client';

describe('IngestionService', () => {
  let service: IngestionService;
  let prismaService: PrismaService;
  let aggregationService: AggregationService;
  let mockQueue: any;

  beforeEach(async () => {
    mockQueue = {
      add: jest.fn().mockResolvedValue({ id: 'job_1' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IngestionService,
        {
          provide: PrismaService,
          useValue: {
            customer: {
              upsert: jest.fn().mockResolvedValue({ id: 'cust_1' }),
            },
            usageEvent: {
              create: jest.fn(),
              findUnique: jest.fn(),
              count: jest.fn(),
            },
          },
        },
        {
          provide: AggregationService,
          useValue: {
            aggregateEvent: jest.fn().mockResolvedValue({ success: true, path: 'redis' }),
          },
        },
        {
          provide: 'BullQueue_events-queue',
          useValue: mockQueue,
        },
      ],
    }).compile();

    service = module.get<IngestionService>(IngestionService);
    prismaService = module.get<PrismaService>(PrismaService);
    aggregationService = module.get<AggregationService>(AggregationService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should accept a new valid event, insert DB row, and enqueue to BullMQ', async () => {
    const dto = {
      event_id: 'evt_100',
      customer_id: 'cust_1',
      feature_key: 'api_calls',
      quantity: 5,
      timestamp: '2026-08-30T12:00:00.000Z',
    };

    (prismaService.usageEvent.create as jest.Mock).mockResolvedValue({
      id: 'uuid_1',
      eventId: dto.event_id,
      customerId: dto.customer_id,
      featureKey: dto.feature_key,
      quantity: BigInt(dto.quantity),
      timestamp: new Date(dto.timestamp),
      metadata: {},
      createdAt: new Date('2026-08-30T12:00:01.000Z'),
    });

    const result = await service.ingest(dto);

    expect(result.status).toBe('accepted');
    expect(result.eventId).toBe('evt_100');
    expect(result.timestamp).toBeDefined();
    expect(mockQueue.add).toHaveBeenCalledWith(
      'process-event',
      expect.objectContaining({
        customerId: 'cust_1',
        featureKey: 'api_calls',
        quantity: 5,
      }),
      expect.any(Object),
    );
  });

  it('should detect duplicate eventId from database unique constraint and return duplicate status without re-enqueueing', async () => {
    const dto = {
      event_id: 'evt_duplicate',
      customer_id: 'cust_1',
      feature_key: 'api_calls',
      quantity: 5,
      timestamp: '2026-08-30T12:00:00.000Z',
    };

    const prismaError = new Prisma.PrismaClientKnownRequestError(
      'Unique constraint failed on the fields: (`event_id`)',
      { code: 'P2002', clientVersion: '6.4.1' },
    );

    (prismaService.usageEvent.create as jest.Mock).mockRejectedValue(prismaError);

    const result = await service.ingest(dto);

    expect(result.status).toBe('duplicate');
    expect(result.eventId).toBe('evt_duplicate');
    expect(result.message).toBe('Event already recorded');
    expect(mockQueue.add).not.toHaveBeenCalled();
  });
});
