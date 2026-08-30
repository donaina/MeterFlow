import { Controller, Get, Param, HttpStatus, Res } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
import { Response } from 'express';
import { LedgerService } from './ledger.service';

@ApiTags('Ledger')
@Controller('ledger')
export class LedgerController {
  constructor(private readonly ledgerService: LedgerService) {}

  @Get('summary')
  @ApiOperation({
    summary: 'System-Wide Ledger Balance Verification',
    description: 'Calculates total debits and total credits across all journal entries and asserts the double-entry invariant sum(debits) === sum(credits).',
  })
  @ApiResponse({ status: 200, description: 'Ledger balance summary' })
  async getSummary(@Res() res: Response) {
    const summary = await this.ledgerService.verifyLedgerBalance();
    return res.status(HttpStatus.OK).json(summary);
  }

  @Get('entries')
  @ApiOperation({ summary: 'List All Double-Entry Journal Records' })
  @ApiResponse({ status: 200, description: 'List of journal records' })
  async getEntries(@Res() res: Response) {
    const entries = await this.ledgerService.getJournalEntries();
    return res.status(HttpStatus.OK).json(entries);
  }

  @Get('invoice/:invoiceId')
  @ApiOperation({
    summary: 'Get Double-Entry Journal Audit for a Specific Invoice',
    description: 'Returns debit/credit journal entries and balance invariant check for an individual invoice.',
  })
  @ApiParam({ name: 'invoiceId', description: 'Invoice UUID' })
  @ApiResponse({ status: 200, description: 'Invoice journal audit breakdown' })
  async getInvoiceLedger(@Param('invoiceId') invoiceId: string, @Res() res: Response) {
    const [summary, entries] = await Promise.all([
      this.ledgerService.verifyLedgerBalance(invoiceId),
      this.ledgerService.getJournalEntries(invoiceId),
    ]);

    return res.status(HttpStatus.OK).json({
      invoice_id: invoiceId,
      balance_check: summary,
      entries,
    });
  }
}
