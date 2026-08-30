import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Event Ingestion & Idempotency (e2e)', () => {
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

    prisma = moduleFixture.get<PrismaService>(PrismaService);
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

  describe('POST /events (Idempotency & Retries)', () => {
    const testEventId = `evt_e2e_${Date.now()}`;
    const payload = {
      event_id: testEventId,
      customer_id: 'cust_acme_corp',
      feature_key: 'zap_executions',
      quantity: 10,
      timestamp: new Date().toISOString(),
      metadata: { environment: 'production', execution_id: 'exec_9988' },
    };

    it('should accept a new event and return 202 Accepted', async () => {
      const response = await request(app.getHttpServer())
        .post('/events')
        .send(payload)
        .expect(202);

      expect(response.body.status).toBe('accepted');
      expect(response.body.event_id).toBe(testEventId);
      expect(response.body.timestamp).toBeDefined();

      // Verify exactly 1 row in DB
      const dbEvent = await prisma.usageEvent.findUnique({
        where: { eventId: testEventId },
      });
      expect(dbEvent).not.toBeNull();
      expect(Number(dbEvent!.quantity)).toBe(10);
      expect(dbEvent!.featureKey).toBe('zap_executions');
    });

    it('should return 200 OK on duplicate retries and NOT insert a second row', async () => {
      const response = await request(app.getHttpServer())
        .post('/events')
        .send(payload)
        .expect(200);

      expect(response.body.status).toBe('duplicate');
      expect(response.body.event_id).toBe(testEventId);
      expect(response.body.message).toBe('Event already recorded');

      // Verify still exactly 1 row in DB
      const count = await prisma.usageEvent.count({
        where: { eventId: testEventId },
      });
      expect(count).toBe(1);
    });
  });

  describe('POST /events (Concurrency Stress Test)', () => {
    it('should handle 10 concurrent identical event requests atomically without double-counting', async () => {
      const concurrentEventId = `evt_concurrent_${Date.now()}`;
      const concurrentPayload = {
        event_id: concurrentEventId,
        customer_id: 'cust_concurrency_test',
        feature_key: 'api_calls',
        quantity: 1,
        timestamp: new Date().toISOString(),
      };

      const concurrencyLevel = 10;
      const requests = Array.from({ length: concurrencyLevel }).map(() =>
        request(app.getHttpServer()).post('/events').send(concurrentPayload),
      );

      const responses = await Promise.all(requests);

      const acceptedResponses = responses.filter((r) => r.status === 202);
      const duplicateResponses = responses.filter((r) => r.status === 200);

      // Exactly 1 must be accepted, all others must be recognized as duplicates
      expect(acceptedResponses.length).toBe(1);
      expect(duplicateResponses.length).toBe(concurrencyLevel - 1);

      for (const dup of duplicateResponses) {
        expect(dup.body.status).toBe('duplicate');
        expect(dup.body.event_id).toBe(concurrentEventId);
      }

      // Assert exactly 1 row exists in the database
      const count = await prisma.usageEvent.count({
        where: { eventId: concurrentEventId },
      });
      expect(count).toBe(1);
    });
  });

  describe('POST /events (Boundary & Validation Errors)', () => {
    it('should reject negative quantities with 400 Bad Request', async () => {
      const response = await request(app.getHttpServer())
        .post('/events')
        .send({
          event_id: `evt_neg_${Date.now()}`,
          customer_id: 'cust_bad_data',
          feature_key: 'api_calls',
          quantity: -5,
          timestamp: new Date().toISOString(),
        })
        .expect(400);

      expect(response.body.message).toContain('quantity must be greater than or equal to 1');
    });

    it('should reject zero quantity with 400 Bad Request', async () => {
      const response = await request(app.getHttpServer())
        .post('/events')
        .send({
          event_id: `evt_zero_${Date.now()}`,
          customer_id: 'cust_bad_data',
          feature_key: 'api_calls',
          quantity: 0,
          timestamp: new Date().toISOString(),
        })
        .expect(400);

      expect(response.body.message).toContain('quantity must be greater than or equal to 1');
    });

    it('should reject malformed ISO8601 timestamp with 400 Bad Request', async () => {
      const response = await request(app.getHttpServer())
        .post('/events')
        .send({
          event_id: `evt_bad_date_${Date.now()}`,
          customer_id: 'cust_bad_data',
          feature_key: 'api_calls',
          quantity: 5,
          timestamp: 'not-a-valid-date',
        })
        .expect(400);

      expect(response.body.message).toContain('timestamp must be a valid ISO8601 date string');
    });

    it('should reject missing required fields with 400 Bad Request', async () => {
      const response = await request(app.getHttpServer())
        .post('/events')
        .send({
          customer_id: 'cust_missing_fields',
        })
        .expect(400);

      expect(response.body.error).toBe('Bad Request');
    });
  });
});
