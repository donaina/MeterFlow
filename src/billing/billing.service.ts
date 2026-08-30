import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AggregationService } from '../aggregation/aggregation.service';
import { PricingService } from '../pricing/pricing.service';
import { LedgerService } from '../ledger/ledger.service';
import { GenerateInvoiceDto } from './dto/generate-invoice.dto';
import { PlanPricingConfig } from '../pricing/interfaces/pricing-strategy.interface';
import { Prisma } from '@prisma/client';

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly aggregationService: AggregationService,
    private readonly pricingService: PricingService,
    private readonly ledgerService: LedgerService,
  ) {}

  /**
   * Generates and finalizes an immutable invoice with balanced double-entry ledger entries.
   * Entire operation runs in a single atomic ACID database transaction.
   */
  async generateInvoice(dto: GenerateInvoiceDto) {
    // 1. Flush any pending in-memory Redis counters to PostgreSQL
    await this.aggregationService.flushCountersToDatabase();

    const periodStart = new Date(dto.period_start);
    const periodEnd = new Date(dto.period_end);

    // 2. Resolve Plan and Customer
    const customer = await this.prisma.customer.findUnique({
      where: { id: dto.customer_id },
      include: {
        subscriptions: {
          where: { status: 'ACTIVE' },
          include: { plan: true },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    if (!customer) {
      throw new NotFoundException(`Customer "${dto.customer_id}" not found`);
    }

    let planId = dto.plan_id;
    let planVersion = 1;
    let planConfig: PlanPricingConfig;
    let subscriptionId: string | null = null;

    if (planId) {
      const plan = await this.prisma.plan.findUnique({ where: { id: planId } });
      if (!plan) throw new NotFoundException(`Plan "${planId}" not found`);
      planConfig = plan.pricingConfig as unknown as PlanPricingConfig;
      planVersion = plan.version;
    } else if (customer.subscriptions.length > 0) {
      const sub = customer.subscriptions[0];
      subscriptionId = sub.id;
      planId = sub.plan.id;
      planVersion = sub.plan.version;
      planConfig = sub.plan.pricingConfig as unknown as PlanPricingConfig;
    } else {
      throw new NotFoundException(
        `No active subscription or plan_id provided for customer "${dto.customer_id}"`,
      );
    }

    // 3. Fetch aggregated usage records for the billing period
    const usageRecords = await this.prisma.usageRecord.findMany({
      where: {
        customerId: dto.customer_id,
        periodStart: { gte: periodStart },
        periodEnd: { lte: periodEnd },
      },
    });

    const usageMap: { [featureKey: string]: number } = {};
    for (const record of usageRecords) {
      usageMap[record.featureKey] = (usageMap[record.featureKey] || 0) + Number(record.quantity);
    }

    // 4. Calculate cost breakdown via Pricing Engine
    const calculation = this.pricingService.calculateCost(planConfig, usageMap, {
      planId,
      planVersion,
    });

    // 5. Generate unique invoice number
    const timestampStr = periodStart.toISOString().slice(0, 7).replace('-', '');
    const randomSuffix = Math.random().toString(36).substring(2, 7).toUpperCase();
    const invoiceNumber = `INV-${timestampStr}-${randomSuffix}`;

    const totalCentsBigInt = BigInt(calculation.totalAmountCents);

    // 6. Execute atomic invoice creation + ledger journal write inside an ACID transaction
    const finalizedInvoice = await this.prisma.$transaction(async (tx) => {
      // a. Create Invoice record
      const invoice = await tx.invoice.create({
        data: {
          invoiceNumber,
          customerId: dto.customer_id,
          subscriptionId,
          planId: planId!,
          planVersion,
          pricingConfigSnapshot: planConfig as unknown as Prisma.InputJsonValue,
          periodStart,
          periodEnd,
          subtotalCents: totalCentsBigInt,
          totalCents: totalCentsBigInt,
          status: 'FINALIZED',
          finalizedAt: new Date(),
        },
      });

      // b. Create Line Items
      for (const item of calculation.lineItems) {
        await tx.invoiceLineItem.create({
          data: {
            invoiceId: invoice.id,
            featureKey: item.featureKey || null,
            description: item.description,
            quantity: BigInt(item.quantity),
            amountCents: BigInt(item.amountCents),
            details: (item.details || {}) as unknown as Prisma.InputJsonValue,
          },
        });
      }

      // c. Record balanced double-entry journal entries
      await this.ledgerService.recordInvoiceJournalEntries(
        tx,
        invoice.id,
        calculation.totalAmountCents,
        calculation.lineItems,
      );

      return invoice;
    });

    this.logger.log(
      `Finalized invoice ${finalizedInvoice.invoiceNumber} for customer ${dto.customer_id} with total ${calculation.totalAmountCents}¢`,
    );

    return this.getInvoiceById(finalizedInvoice.id);
  }

  /**
   * Retrieve full details of an invoice.
   */
  async getInvoiceById(id: string) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id },
      include: {
        customer: true,
        plan: true,
        lineItems: true,
        journalEntries: true,
      },
    });

    if (!invoice) {
      throw new NotFoundException(`Invoice "${id}" not found`);
    }

    return {
      ...invoice,
      subtotalCents: Number(invoice.subtotalCents),
      totalCents: Number(invoice.totalCents),
      lineItems: invoice.lineItems.map((li) => ({
        ...li,
        quantity: Number(li.quantity),
        amountCents: Number(li.amountCents),
      })),
      journalEntries: invoice.journalEntries.map((je) => ({
        ...je,
        amountCents: Number(je.amountCents),
      })),
    };
  }

  /**
   * List invoices for a customer.
   */
  async listInvoicesForCustomer(customerId: string) {
    const invoices = await this.prisma.invoice.findMany({
      where: { customerId },
      orderBy: { createdAt: 'desc' },
      include: { lineItems: true },
    });

    return invoices.map((inv) => ({
      ...inv,
      subtotalCents: Number(inv.subtotalCents),
      totalCents: Number(inv.totalCents),
      lineItems: inv.lineItems.map((li) => ({
        ...li,
        quantity: Number(li.quantity),
        amountCents: Number(li.amountCents),
      })),
    }));
  }

  /**
   * Attempting to mutate a finalized invoice is strictly forbidden by Non-Negotiable #3.
   */
  async attemptUpdateFinalizedInvoice(id: string) {
    const invoice = await this.getInvoiceById(id);
    if (invoice.status === 'FINALIZED') {
      throw new ForbiddenException(
        `Finalized invoices are immutable. Corrections must happen via credit notes or new invoices, never in-place (Invoice ID: ${id}).`,
      );
    }
  }
}
