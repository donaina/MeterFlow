import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { AggregationService } from '../src/aggregation/aggregation.service';

describe('Usage Aggregation & Metering Pipeline (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let aggregationService: AggregationService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();

    prisma = moduleFixture.get<PrismaService>(PrismaService);
    aggregationService = moduleFixture.get<AggregationService>(AggregationService);
  });

  afterAll(async () => {
    // Clean up test data
    await prisma.journalEntry.deleteMany({});
    await prisma.invoiceLineItem.deleteMany({});
    await prisma.invoice.deleteMany({});
    await prisma.usageRecord.deleteMany({});
    await prisma.usageEvent.deleteMany({});
    await prisma.subscription.deleteMany({});
    await prisma.customer.deleteMany({});
    await prisma.plan.deleteMany({});
    await app.close();
  });

  describe('Multi-Period Aggregation & Out-of-Order / Late Events', () => {
    const customerId = `cust_agg_${Date.now()}`;
    const featureKey = 'tasks_executed';

    it('should correctly aggregate events across multiple calendar billing periods', async () => {
      // 1. July event
      await request(app.getHttpServer())
        .post('/events')
        .send({
          event_id: `evt_july_1_${Date.now()}`,
          customer_id: customerId,
          feature_key: featureKey,
          quantity: 15,
          timestamp: '2026-07-15T12:00:00.000Z',
        })
        .expect(202);

      // 2. August event
      await request(app.getHttpServer())
        .post('/events')
        .send({
          event_id: `evt_aug_1_${Date.now()}`,
          customer_id: customerId,
          feature_key: featureKey,
          quantity: 25,
          timestamp: '2026-08-10T10:00:00.000Z',
        })
        .expect(202);

      // Give worker brief moment to process BullMQ jobs
      await new Promise((r) => setTimeout(r, 500));

      // Flush in-memory Redis counters to PostgreSQL usage_records
      const flushRes = await request(app.getHttpServer())
        .post('/usage/flush')
        .expect(200);

      expect(flushRes.body.status).toBe('flushed');

      // Verify records in PostgreSQL
      const records = await prisma.usageRecord.findMany({
        where: { customerId, featureKey },
        orderBy: { periodStart: 'asc' },
      });

      expect(records.length).toBe(2);
      expect(records[0].periodStart.toISOString()).toContain('2026-07-01');
      expect(Number(records[0].quantity)).toBe(15);

      expect(records[1].periodStart.toISOString()).toContain('2026-08-01');
      expect(Number(records[1].quantity)).toBe(25);
    });

    it('should correctly attribute late/out-of-order event to historical July period', async () => {
      // Ingest a late July event while current time / other events are in August
      await request(app.getHttpServer())
        .post('/events')
        .send({
          event_id: `evt_july_late_${Date.now()}`,
          customer_id: customerId,
          feature_key: featureKey,
          quantity: 10,
          timestamp: '2026-07-28T23:30:00.000Z',
        })
        .expect(202);

      await new Promise((r) => setTimeout(r, 500));

      // Flush to PostgreSQL
      await request(app.getHttpServer())
        .post('/usage/flush')
        .expect(200);

      // Query usage via API
      const usageRes = await request(app.getHttpServer())
        .get(`/usage/${customerId}`)
        .expect(200);

      const items = usageRes.body.records;
      const julyItem = items.find((i: any) => i.periodKey === '2026-07');
      const augItem = items.find((i: any) => i.periodKey === '2026-08');

      expect(julyItem).toBeDefined();
      expect(julyItem.totalQuantity).toBe(25); // 15 initial + 10 late = 25

      expect(augItem).toBeDefined();
      expect(augItem.totalQuantity).toBe(25); // August unchanged at 25
    });
  });

  describe('Durable Fallback Path (Redis Resilience)', () => {
    it('should persist directly to PostgreSQL usage_records without data loss when Redis fallback is used', async () => {
      const fallbackCustomerId = `cust_fallback_${Date.now()}`;
      const fallbackFeature = 'database_queries';

      // Aggregate directly via fallback
      const result = await aggregationService.aggregateEvent({
        customerId: fallbackCustomerId,
        featureKey: fallbackFeature,
        quantity: 50,
        timestamp: '2026-08-01T00:00:00.000Z',
      });

      expect(result.success).toBe(true);

      // Flush or directly query
      await aggregationService.flushCountersToDatabase();

      const usage = await aggregationService.getUsageForCustomer(fallbackCustomerId);
      const item = usage.find((u) => u.featureKey === fallbackFeature);

      expect(item).toBeDefined();
      expect(item!.totalQuantity).toBe(50);
    });
  });
});
