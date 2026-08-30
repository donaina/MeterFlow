import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Invoice Generation & Double-Entry Ledger (e2e)', () => {
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
    await prisma.usageRecord.deleteMany({});
    await prisma.usageEvent.deleteMany({});
    await prisma.subscription.deleteMany({});
    await prisma.plan.deleteMany({});
    await prisma.customer.deleteMany({});
    await app.close();
  });

  describe('Full Month of Simulated Usage → Invoice → Ledger Invariant Balancing', () => {
    let customerId: string;
    let planId: string;
    let invoiceId: string;

    it('should set up a customer and a hybrid usage plan', async () => {
      customerId = `cust_invoicing_${Date.now()}`;

      // 1. Create Plan
      const planRes = await request(app.getHttpServer())
        .post('/plans')
        .send({
          name: 'Enterprise Scale Plan',
          pricing_config: {
            flat_fee: {
              amount_cents: 5000, // $50/month base subscription
              description: 'Enterprise Base Subscription',
            },
            rules: [
              {
                feature_key: 'zap_tasks',
                type: 'tiered_graduated',
                config: {
                  description: 'Zap Tasks Executed',
                  tiers: [
                    { from: 0, to: 1000, rate_cents: 0 },       // 1,000 free tasks
                    { from: 1000, to: 5000, rate_cents: 5 },     // 5¢ per task for next 4,000
                    { from: 5000, to: null, rate_cents: 2 },     // 2¢ per task over 5,000
                  ],
                },
              },
              {
                feature_key: 'storage_gb',
                type: 'per_unit',
                config: {
                  description: 'High-Speed Storage',
                  rate_cents: 10,       // 10¢ per GB
                  free_allowance: 20,   // 20 GB free
                },
              },
            ],
          },
        })
        .expect(201);

      planId = planRes.body.id;
      expect(planId).toBeDefined();

      // 2. Create Customer & Subscription
      const customer = await prisma.customer.create({
        data: {
          id: customerId,
          name: 'Acme Mega Corp',
          email: `${customerId}@acme.com`,
          subscriptions: {
            create: {
              planId,
              status: 'ACTIVE',
              startDate: new Date('2026-08-01T00:00:00.000Z'),
            },
          },
        },
      });
      expect(customer.id).toBe(customerId);
    });

    it('should simulate a month of usage event stream', async () => {
      // Event 1: 1,500 Zap tasks in early August
      await request(app.getHttpServer())
        .post('/events')
        .send({
          event_id: `evt_zap_1_${Date.now()}`,
          customer_id: customerId,
          feature_key: 'zap_tasks',
          quantity: 1500,
          timestamp: '2026-08-05T12:00:00.000Z',
        })
        .expect(202);

      // Event 2: 2,000 Zap tasks in mid August (Total tasks = 3,500)
      await request(app.getHttpServer())
        .post('/events')
        .send({
          event_id: `evt_zap_2_${Date.now()}`,
          customer_id: customerId,
          feature_key: 'zap_tasks',
          quantity: 2000,
          timestamp: '2026-08-20T16:00:00.000Z',
        })
        .expect(202);

      // Event 3: 60 GB storage
      await request(app.getHttpServer())
        .post('/events')
        .send({
          event_id: `evt_storage_1_${Date.now()}`,
          customer_id: customerId,
          feature_key: 'storage_gb',
          quantity: 60,
          timestamp: '2026-08-25T08:00:00.000Z',
        })
        .expect(202);

      // Brief delay for queue processing
      await new Promise((r) => setTimeout(r, 600));
    });

    it('should generate an invoice matching exact pricing formula and balanced ledger entries', async () => {
      // Generate invoice for August 2026
      const invoiceRes = await request(app.getHttpServer())
        .post('/invoices/generate')
        .send({
          customer_id: customerId,
          period_start: '2026-08-01T00:00:00.000Z',
          period_end: '2026-08-31T23:59:59.999Z',
        })
        .expect(201);

      const invoice = invoiceRes.body;
      invoiceId = invoice.id;

      expect(invoice.id).toBeDefined();
      expect(invoice.invoiceNumber).toMatch(/^INV-202608-/);
      expect(invoice.status).toBe('FINALIZED');

      // Expected calculation:
      // Base fee: 5,000¢
      // Zap tasks (3,500 total): 1,000 @ 0 + 2,500 @ 5 = 12,500¢
      // Storage (60 total - 20 free = 40 billable * 10) = 400¢
      // Total: 5,000 + 12,500 + 400 = 17,900 cents ($179.00)
      expect(invoice.totalCents).toBe(17900);
      expect(invoice.subtotalCents).toBe(17900);
      expect(invoice.lineItems.length).toBe(3);

      // Assert Journal Entries on Invoice
      expect(invoice.journalEntries.length).toBe(4); // 1 Debit + 3 Credits

      const debit = invoice.journalEntries.find((j: any) => j.entryType === 'DEBIT');
      expect(debit).toBeDefined();
      expect(debit.account).toBe('ACCOUNTS_RECEIVABLE');
      expect(debit.amountCents).toBe(17900);

      const credits = invoice.journalEntries.filter((j: any) => j.entryType === 'CREDIT');
      const creditSum = credits.reduce((sum: number, c: any) => sum + c.amountCents, 0);
      expect(creditSum).toBe(17900);
    });

    it('should verify that system-wide and per-invoice debits equal credits', async () => {
      // Verify via Ledger endpoint
      const ledgerRes = await request(app.getHttpServer())
        .get(`/ledger/invoice/${invoiceId}`)
        .expect(200);

      expect(ledgerRes.body.balance_check.isBalanced).toBe(true);
      expect(ledgerRes.body.balance_check.totalDebitsCents).toBe(17900);
      expect(ledgerRes.body.balance_check.totalCreditsCents).toBe(17900);

      const systemLedgerRes = await request(app.getHttpServer())
        .get('/ledger/summary')
        .expect(200);

      expect(systemLedgerRes.body.isBalanced).toBe(true);
      expect(systemLedgerRes.body.totalDebitsCents).toBe(systemLedgerRes.body.totalCreditsCents);
    });

    it('should enforce invoice immutability and reject any update attempt with 403 Forbidden', async () => {
      const mutateRes = await request(app.getHttpServer())
        .put(`/invoices/${invoiceId}`)
        .send({
          total_cents: 9999,
        })
        .expect(403);

      expect(mutateRes.body.message).toContain('Finalized invoices are immutable');
    });
  });
});
