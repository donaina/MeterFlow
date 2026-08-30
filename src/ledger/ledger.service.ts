import { Injectable, Logger, UnprocessableEntityException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { LineItemBreakdown } from '../pricing/interfaces/pricing-strategy.interface';

export interface LedgerBalanceCheck {
  totalDebitsCents: number;
  totalCreditsCents: number;
  isBalanced: boolean;
  entriesCount: number;
}

@Injectable()
export class LedgerService {
  private readonly logger = new Logger(LedgerService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Create balanced double-entry journal entries for an invoice inside a database transaction.
   * Debits: ACCOUNTS_RECEIVABLE (Asset)
   * Credits: REVENUE (Income)
   */
  async recordInvoiceJournalEntries(
    tx: Prisma.TransactionClient,
    invoiceId: string,
    totalAmountCents: number,
    lineItems: LineItemBreakdown[],
  ) {
    if (totalAmountCents <= 0) {
      this.logger.log(`Invoice ${invoiceId} has 0 total amount; skipping zero-value journal entries`);
      return;
    }

    const totalBigInt = BigInt(totalAmountCents);

    // 1. Debit Accounts Receivable (Asset)
    await tx.journalEntry.create({
      data: {
        invoiceId,
        entryType: 'DEBIT',
        account: 'ACCOUNTS_RECEIVABLE',
        amountCents: totalBigInt,
        description: `Invoice receivable for invoice ${invoiceId}`,
      },
    });

    let creditSum = BigInt(0);

    // 2. Credit Revenue per line item
    for (const item of lineItems) {
      if (item.amountCents > 0) {
        const itemAmountBigInt = BigInt(item.amountCents);
        const account = item.featureKey ? 'USAGE_REVENUE' : 'SUBSCRIPTION_REVENUE';

        await tx.journalEntry.create({
          data: {
            invoiceId,
            entryType: 'CREDIT',
            account,
            amountCents: itemAmountBigInt,
            description: `${item.description} (invoice ${invoiceId})`,
          },
        });

        creditSum += itemAmountBigInt;
      }
    }

    // Invariant check: Debits must strictly equal Credits
    if (totalBigInt !== creditSum) {
      this.logger.error(
        `Ledger invariant violation for invoice ${invoiceId}: Debits (${totalBigInt}) != Credits (${creditSum})`,
      );
      throw new UnprocessableEntityException(
        `Double-entry ledger invariant failed: Debits (${totalBigInt}) != Credits (${creditSum})`,
      );
    }

    this.logger.log(
      `Recorded balanced journal entries for invoice ${invoiceId}: ${totalAmountCents}¢ Debit = ${creditSum}¢ Credit`,
    );
  }

  /**
   * Compute system-wide or per-invoice ledger balance verification.
   */
  async verifyLedgerBalance(invoiceId?: string): Promise<LedgerBalanceCheck> {
    const whereClause = invoiceId ? { invoiceId } : {};

    const entries = await this.prisma.journalEntry.findMany({
      where: whereClause,
    });

    let totalDebits = 0;
    let totalCredits = 0;

    for (const entry of entries) {
      const amount = Number(entry.amountCents);
      if (entry.entryType === 'DEBIT') {
        totalDebits += amount;
      } else if (entry.entryType === 'CREDIT') {
        totalCredits += amount;
      }
    }

    const isBalanced = totalDebits === totalCredits;

    return {
      totalDebitsCents: totalDebits,
      totalCreditsCents: totalCredits,
      isBalanced,
      entriesCount: entries.length,
    };
  }

  /**
   * List journal entries for an invoice or whole ledger.
   */
  async getJournalEntries(invoiceId?: string) {
    const entries = await this.prisma.journalEntry.findMany({
      where: invoiceId ? { invoiceId } : {},
      orderBy: { createdAt: 'asc' },
    });

    return entries.map((e) => ({
      ...e,
      amountCents: Number(e.amountCents),
    }));
  }
}
