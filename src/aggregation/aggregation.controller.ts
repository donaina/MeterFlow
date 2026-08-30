import { Controller, Get, Post, Param, Query, HttpStatus, Res } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiQuery } from '@nestjs/swagger';
import { Response } from 'express';
import { AggregationService } from './aggregation.service';

@ApiTags('Aggregation')
@Controller('usage')
export class AggregationController {
  constructor(private readonly aggregationService: AggregationService) {}

  @Get(':customerId')
  @ApiOperation({
    summary: 'Get Customer Aggregated Usage',
    description: 'Retrieves aggregated feature usage totals for a customer within an optional billing period.',
  })
  @ApiParam({ name: 'customerId', description: 'Unique customer identifier' })
  @ApiQuery({ name: 'periodKey', required: false, description: 'Period key (e.g. 2026-08)' })
  @ApiResponse({ status: 200, description: 'Usage totals retrieved successfully' })
  async getUsage(
    @Param('customerId') customerId: string,
    @Query('periodKey') periodKey: string | undefined,
    @Res() res: Response,
  ) {
    const items = await this.aggregationService.getUsageForCustomer(customerId);
    const filtered = periodKey ? items.filter((i) => i.periodKey === periodKey) : items;

    return res.status(HttpStatus.OK).json({
      customer_id: customerId,
      period_key: periodKey || 'all',
      records: filtered,
      items: filtered,
    });
  }

  @Post('flush')
  @ApiOperation({
    summary: 'Flush In-Memory Redis Counters to PostgreSQL',
    description: 'Forces an immediate synchronization of dirty in-memory Redis counters into PostgreSQL usage_records.',
  })
  @ApiResponse({ status: 200, description: 'Flush completed successfully' })
  async flush(@Res() res: Response) {
    const result = await this.aggregationService.flushCountersToDatabase();
    return res.status(HttpStatus.OK).json({
      status: 'flushed',
      ...result,
    });
  }
}
