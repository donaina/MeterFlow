import { Controller, Post, Get, Put, Body, Param, HttpStatus, Res } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
import { Response } from 'express';
import { BillingService } from './billing.service';
import { GenerateInvoiceDto } from './dto/generate-invoice.dto';

@ApiTags('Invoices')
@Controller('invoices')
export class BillingController {
  constructor(private readonly billingService: BillingService) {}

  @Post('generate')
  @ApiOperation({
    summary: 'Generate & Finalize an Immutable Invoice',
    description:
      'Aggregates customer usage for the billing period, evaluates pricing config, and atomically creates an invoice, line items, and balanced double-entry ledger journal entries.',
  })
  @ApiResponse({ status: 201, description: 'Invoice finalized and journal entries recorded' })
  @ApiResponse({ status: 404, description: 'Customer or plan not found' })
  async generateInvoice(@Body() dto: GenerateInvoiceDto, @Res() res: Response) {
    const invoice = await this.billingService.generateInvoice(dto);
    return res.status(HttpStatus.CREATED).json(invoice);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get Invoice Details by ID' })
  @ApiParam({ name: 'id', description: 'Invoice UUID' })
  @ApiResponse({ status: 200, description: 'Full invoice details with line items and journal entries' })
  @ApiResponse({ status: 404, description: 'Invoice not found' })
  async getInvoice(@Param('id') id: string, @Res() res: Response) {
    const invoice = await this.billingService.getInvoiceById(id);
    return res.status(HttpStatus.OK).json(invoice);
  }

  @Get('customer/:customerId')
  @ApiOperation({ summary: 'List All Invoices for a Customer' })
  @ApiParam({ name: 'customerId', description: 'Customer UUID' })
  @ApiResponse({ status: 200, description: 'Customer invoice history' })
  async listCustomerInvoices(@Param('customerId') customerId: string, @Res() res: Response) {
    const invoices = await this.billingService.listInvoicesForCustomer(customerId);
    return res.status(HttpStatus.OK).json(invoices);
  }

  @Put(':id')
  @ApiOperation({
    summary: 'Attempt to Mutate Finalized Invoice (Always 403 Forbidden)',
    description:
      'Enforces Non-Negotiable #3 (Finalized invoices are immutable). Any attempt to alter finalized amounts is rejected.',
  })
  @ApiParam({ name: 'id', description: 'Invoice UUID' })
  @ApiResponse({ status: 403, description: 'Forbidden: Finalized invoices are strictly immutable' })
  async updateInvoice(@Param('id') id: string) {
    await this.billingService.attemptUpdateFinalizedInvoice(id);
  }
}
