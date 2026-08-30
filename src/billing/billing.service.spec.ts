import { Test, TestingModule } from '@nestjs/testing';
import { BillingService } from './billing.service';
import { PrismaService } from '../prisma/prisma.service';
import { AggregationService } from '../aggregation/aggregation.service';
import { PricingService } from '../pricing/pricing.service';
import { LedgerService } from '../ledger/ledger.service';
import { ForbiddenException } from '@nestjs/common';

describe('BillingService', () => {
  let service: BillingService;
  let prismaService: PrismaService;
  let aggregationService: AggregationService;
  let pricingService: PricingService;
  let ledgerService: LedgerService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BillingService,
        {
          provide: PrismaService,
          useValue: {
            customer: { findUnique: jest.fn() },
            plan: { findUnique: jest.fn() },
            usageRecord: { findMany: jest.fn().mockResolvedValue([]) },
            invoice: {
              create: jest.fn(),
              findUnique: jest.fn(),
              findMany: jest.fn(),
            },
            invoiceLineItem: { create: jest.fn() },
            $transaction: jest.fn().mockImplementation(async (cb) => {
              const mockTx = {
                invoice: {
                  create: jest.fn().mockResolvedValue({
                    id: 'inv_generated_1',
                    invoiceNumber: 'INV-202608-TEST',
                    totalCents: BigInt(5000),
                  }),
                },
                invoiceLineItem: {
                  create: jest.fn().mockResolvedValue({ id: 'li_1' }),
                },
              };
              return cb(mockTx);
            }),
          },
        },
        {
          provide: AggregationService,
          useValue: {
            flushCountersToDatabase: jest.fn().mockResolvedValue({ flushedKeysCount: 0 }),
          },
        },
        {
          provide: PricingService,
          useValue: {
            calculateCost: jest.fn().mockReturnValue({
              totalAmountCents: 5000,
              lineItems: [
                { description: 'Base Fee', quantity: 1, amountCents: 5000 },
              ],
            }),
          },
        },
        {
          provide: LedgerService,
          useValue: {
            recordInvoiceJournalEntries: jest.fn().mockResolvedValue(undefined),
          },
        },
      ],
    }).compile();

    service = module.get<BillingService>(BillingService);
    prismaService = module.get<PrismaService>(PrismaService);
    aggregationService = module.get<AggregationService>(AggregationService);
    pricingService = module.get<PricingService>(PricingService);
    ledgerService = module.get<LedgerService>(LedgerService);
  });

  it('should generate invoice atomically with ledger entries', async () => {
    (prismaService.customer.findUnique as jest.Mock).mockResolvedValue({
      id: 'cust_1',
      subscriptions: [],
    });

    (prismaService.plan.findUnique as jest.Mock).mockResolvedValue({
      id: 'plan_1',
      name: 'Pro',
      version: 1,
      pricingConfig: { flat_fee: { amount_cents: 5000 }, rules: [] },
    });

    (prismaService.invoice.findUnique as jest.Mock).mockResolvedValue({
      id: 'inv_generated_1',
      invoiceNumber: 'INV-202608-TEST',
      customerId: 'cust_1',
      planId: 'plan_1',
      planVersion: 1,
      pricingConfigSnapshot: {},
      subtotalCents: BigInt(5000),
      totalCents: BigInt(5000),
      status: 'FINALIZED',
      customer: { id: 'cust_1' },
      plan: { id: 'plan_1' },
      lineItems: [{ id: 'li_1', description: 'Base Fee', quantity: BigInt(1), amountCents: BigInt(5000) }],
      journalEntries: [
        { id: 'je_1', entryType: 'DEBIT', account: 'ACCOUNTS_RECEIVABLE', amountCents: BigInt(5000) },
        { id: 'je_2', entryType: 'CREDIT', account: 'SUBSCRIPTION_REVENUE', amountCents: BigInt(5000) },
      ],
    });

    const result = await service.generateInvoice({
      customer_id: 'cust_1',
      plan_id: 'plan_1',
      period_start: '2026-08-01T00:00:00.000Z',
      period_end: '2026-08-31T23:59:59.999Z',
    });

    expect(aggregationService.flushCountersToDatabase).toHaveBeenCalled();
    expect(pricingService.calculateCost).toHaveBeenCalled();
    expect(prismaService.$transaction).toHaveBeenCalled();
    expect(result.totalCents).toBe(5000);
  });

  it('should enforce immutability and throw ForbiddenException on update attempts', async () => {
    (prismaService.invoice.findUnique as jest.Mock).mockResolvedValue({
      id: 'inv_finalized',
      status: 'FINALIZED',
      subtotalCents: BigInt(5000),
      totalCents: BigInt(5000),
      customer: {},
      plan: {},
      lineItems: [],
      journalEntries: [],
    });

    await expect(
      service.attemptUpdateFinalizedInvoice('inv_finalized'),
    ).rejects.toThrow(ForbiddenException);
  });
});
