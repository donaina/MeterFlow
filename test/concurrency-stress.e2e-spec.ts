import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Concurrency & Production Hardening Stress Tests (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

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
    await app.listen(0);

    prisma = moduleFixture.get<PrismaService>(PrismaService);
  });

  afterAll(async () => {
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

  describe('High-Throughput Burst Concurrency & Lost Update Prevention', () => {
    it('should aggregate 50 concurrent parallel ingestion events without a single lost update', async () => {
      const customerId = `cust_burst_${Date.now()}`;
      const featureKey = 'api_calls';
      const concurrencyCount = 50;
      const quantityPerEvent = 5;
      const expectedTotal = concurrencyCount * quantityPerEvent; // 250

      const promises = Array.from({ length: concurrencyCount }, (_, i) =>
        request(app.getHttpServer())
          .post('/events')
          .send({
            event_id: `evt_burst_${customerId}_${i}`,
            customer_id: customerId,
            feature_key: featureKey,
            quantity: quantityPerEvent,
            timestamp: '2026-08-15T12:00:00.000Z',
          })
          .then((res) => {
            expect(res.status).toBe(202);
            return res;
          }),
      );

      await Promise.all(promises);

      // Wait briefly for BullMQ background processor queue to clear
      await new Promise((r) => setTimeout(r, 1200));

      // Flush Redis in-memory counters to PostgreSQL
      await request(app.getHttpServer()).post('/usage/flush').expect(200);

      // Check PostgreSQL usage record
      const usageRecord = await prisma.usageRecord.findFirst({
        where: { customerId, featureKey },
      });

      expect(usageRecord).toBeDefined();
      expect(Number(usageRecord!.quantity)).toBe(expectedTotal);
    });

    it('should handle a 20-request concurrent duplicate event storm with atomic DB idempotency', async () => {
      const stormEventId = `evt_storm_${Date.now()}`;
      const stormCustomerId = `cust_storm_${Date.now()}`;
      const stormQuantity = 10;
      const stormParallelRequests = 20;

      const promises = Array.from({ length: stormParallelRequests }, () =>
        request(app.getHttpServer())
          .post('/events')
          .send({
            event_id: stormEventId,
            customer_id: stormCustomerId,
            feature_key: 'file_downloads',
            quantity: stormQuantity,
            timestamp: '2026-08-15T14:00:00.000Z',
          })
          .then((res) => {
            // Must return either 202 (first write) or 200 (duplicate suppressed)
            expect([200, 202]).toContain(res.status);
            return res.status;
          }),
      );

      const results = await Promise.all(promises);

      // Exactly 1 request should receive 202 Accepted, and 19 receive 200 OK (Duplicate)
      const acceptedCount = results.filter((s) => s === 202).length;
      const duplicateCount = results.filter((s) => s === 200).length;

      expect(acceptedCount).toBe(1);
      expect(duplicateCount).toBe(stormParallelRequests - 1);

      // Verify PostgreSQL table contains strictly 1 row
      const savedEvents = await prisma.usageEvent.findMany({
        where: { eventId: stormEventId },
      });
      expect(savedEvents.length).toBe(1);

      // Wait and flush
      await new Promise((r) => setTimeout(r, 600));
      await request(app.getHttpServer()).post('/usage/flush').expect(200);

      const usageRecord = await prisma.usageRecord.findFirst({
        where: { customerId: stormCustomerId, featureKey: 'file_downloads' },
      });

      expect(usageRecord).toBeDefined();
      expect(Number(usageRecord!.quantity)).toBe(stormQuantity); // Exactly 10, not 200!
    });
  });
});
