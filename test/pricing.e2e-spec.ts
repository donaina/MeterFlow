import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Pricing Engine & Zero-Redeploy Config Updates (e2e)', () => {
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
    await prisma.journalEntry.deleteMany({});
    await prisma.invoiceLineItem.deleteMany({});
    await prisma.invoice.deleteMany({});
    await prisma.subscription.deleteMany({});
    await prisma.plan.deleteMany({});
    await app.close();
  });

  describe('Config-Driven Pricing & Dynamic Updates', () => {
    let createdPlanId: string;

    it('should create a plan with JSONB graduated pricing config', async () => {
      const planPayload = {
        name: 'Growth Tier Plan',
        pricing_config: {
          flat_fee: {
            amount_cents: 2900, // $29/month
            description: 'Growth Base Subscription',
          },
          rules: [
            {
              feature_key: 'api_calls',
              type: 'tiered_graduated',
              config: {
                description: 'API Calls Tiered',
                tiers: [
                  { from: 0, to: 1000, rate_cents: 0 },
                  { from: 1000, to: 5000, rate_cents: 5 }, // 5¢ per call
                  { from: 5000, to: null, rate_cents: 2 },
                ],
              },
            },
          ],
        },
      };

      const res = await request(app.getHttpServer())
        .post('/plans')
        .send(planPayload)
        .expect(201);

      expect(res.body.id).toBeDefined();
      expect(res.body.version).toBe(1);
      expect(res.body.name).toBe('Growth Tier Plan');
      createdPlanId = res.body.id;
    });

    it('should preview pricing accurately under initial version 1 config', async () => {
      // 3,000 API calls:
      // Base flat fee: 2900¢
      // API calls: 1000 @ 0 + 2000 @ 5 = 10000¢
      // Total: 12900 cents ($129.00)
      const previewRes = await request(app.getHttpServer())
        .post('/pricing/preview')
        .send({
          plan_id: createdPlanId,
          usage: { api_calls: 3000 },
        })
        .expect(200);

      expect(previewRes.body.plan_id).toBe(createdPlanId);
      expect(previewRes.body.plan_version).toBe(1);
      expect(previewRes.body.total_amount_cents).toBe(12900);
      expect(previewRes.body.line_items.length).toBe(2);
    });

    it('should update pricing_config without a code redeploy and immediately recalculate at new rates', async () => {
      // Update plan: increase Tier 2 rate from 5¢ -> 8¢, flat fee from $29 -> $39 (3900¢)
      const updatePayload = {
        name: 'Growth Tier Plan (2026 Revision)',
        pricing_config: {
          flat_fee: {
            amount_cents: 3900, // Increased to $39
            description: 'Growth Base Subscription v2',
          },
          rules: [
            {
              feature_key: 'api_calls',
              type: 'tiered_graduated',
              config: {
                description: 'API Calls Tiered v2',
                tiers: [
                  { from: 0, to: 1000, rate_cents: 0 },
                  { from: 1000, to: 5000, rate_cents: 8 }, // Increased from 5¢ to 8¢
                  { from: 5000, to: null, rate_cents: 3 },
                ],
              },
            },
          ],
        },
      };

      const updateRes = await request(app.getHttpServer())
        .put(`/plans/${createdPlanId}`)
        .send(updatePayload)
        .expect(200);

      expect(updateRes.body.version).toBe(2);

      // Recalculate same 3,000 API calls:
      // Base flat fee: 3900¢
      // API calls: 1000 @ 0 + 2000 @ 8 = 16000¢
      // Total: 3900 + 16000 = 19900 cents ($199.00)
      const newPreviewRes = await request(app.getHttpServer())
        .post('/pricing/preview')
        .send({
          plan_id: createdPlanId,
          usage: { api_calls: 3000 },
        })
        .expect(200);

      expect(newPreviewRes.body.plan_version).toBe(2);
      expect(newPreviewRes.body.total_amount_cents).toBe(19900);
    });
  });
});
