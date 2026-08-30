import { Test, TestingModule } from '@nestjs/testing';
import { LedgerService } from './ledger.service';
import { PrismaService } from '../prisma/prisma.service';
import { UnprocessableEntityException } from '@nestjs/common';

describe('LedgerService (Double-Entry Bookkeeping)', () => {
  let service: LedgerService;
  let prismaService: PrismaService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LedgerService,
        {
          provide: PrismaService,
          useValue: {
            journalEntry: {
              create: jest.fn(),
              findMany: jest.fn(),
            },
          },
        },
      ],
    }).compile();

    service = module.get<LedgerService>(LedgerService);
    prismaService = module.get<PrismaService>(PrismaService);
  });

  it('should create balanced debit and credit entries inside transaction', async () => {
    const mockTx: any = {
      journalEntry: {
        create: jest.fn().mockResolvedValue({ id: 'je_1' }),
      },
    };

    const lineItems = [
      { description: 'Base Fee', quantity: 1, amountCents: 2000 },
      { featureKey: 'api_calls', description: 'API Calls', quantity: 100, amountCents: 3000 },
    ];

    await service.recordInvoiceJournalEntries(mockTx, 'inv_100', 5000, lineItems);

    // 1 debit (5000) + 2 credits (2000 + 3000)
    expect(mockTx.journalEntry.create).toHaveBeenCalledTimes(3);

    // Check Debit
    expect(mockTx.journalEntry.create).toHaveBeenNthCalledWith(1, {
      data: expect.objectContaining({
        invoiceId: 'inv_100',
        entryType: 'DEBIT',
        account: 'ACCOUNTS_RECEIVABLE',
        amountCents: BigInt(5000),
      }),
    });

    // Check Credit 1
    expect(mockTx.journalEntry.create).toHaveBeenNthCalledWith(2, {
      data: expect.objectContaining({
        invoiceId: 'inv_100',
        entryType: 'CREDIT',
        account: 'SUBSCRIPTION_REVENUE',
        amountCents: BigInt(2000),
      }),
    });

    // Check Credit 2
    expect(mockTx.journalEntry.create).toHaveBeenNthCalledWith(3, {
      data: expect.objectContaining({
        invoiceId: 'inv_100',
        entryType: 'CREDIT',
        account: 'USAGE_REVENUE',
        amountCents: BigInt(3000),
      }),
    });
  });

  it('should throw UnprocessableEntityException if total debits do not equal credits', async () => {
    const mockTx: any = {
      journalEntry: {
        create: jest.fn().mockResolvedValue({ id: 'je_1' }),
      },
    };

    // Unbalanced: total is 5000 but line items only sum to 4000
    const unbalancedLineItems = [
      { description: 'Base Fee', quantity: 1, amountCents: 2000 },
      { featureKey: 'api_calls', description: 'API Calls', quantity: 100, amountCents: 2000 },
    ];

    await expect(
      service.recordInvoiceJournalEntries(mockTx, 'inv_unbalanced', 5000, unbalancedLineItems),
    ).rejects.toThrow(UnprocessableEntityException);
  });

  it('should verify ledger balance correctly', async () => {
    (prismaService.journalEntry.findMany as jest.Mock).mockResolvedValue([
      { entryType: 'DEBIT', amountCents: BigInt(5000) },
      { entryType: 'CREDIT', amountCents: BigInt(3000) },
      { entryType: 'CREDIT', amountCents: BigInt(2000) },
    ]);

    const result = await service.verifyLedgerBalance();

    expect(result.totalDebitsCents).toBe(5000);
    expect(result.totalCreditsCents).toBe(5000);
    expect(result.isBalanced).toBe(true);
    expect(result.entriesCount).toBe(3);
  });
});
