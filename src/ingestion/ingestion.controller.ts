import { Controller, Post, Body, HttpStatus, Res } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiHeader } from '@nestjs/swagger';
import { Response } from 'express';
import { IngestionService } from './ingestion.service';
import { IngestEventDto } from './dto/ingest-event.dto';

@ApiTags('Ingestion')
@Controller('events')
export class IngestionController {
  constructor(private readonly ingestionService: IngestionService) {}

  @Post()
  @ApiOperation({
    summary: 'Idempotent Usage Event Ingestion',
    description:
      'Ingests a raw usage event into the append-only audit log. Enforces database-level idempotency on event_id. Returns 202 Accepted on new events and 200 OK on duplicate retries.',
  })
  @ApiHeader({ name: 'x-request-id', required: false, description: 'Trace correlation ID' })
  @ApiResponse({ status: 202, description: 'Event accepted and queued for aggregation' })
  @ApiResponse({ status: 200, description: 'Duplicate event suppressed (idempotent)' })
  @ApiResponse({ status: 400, description: 'Invalid event payload or validation error' })
  async ingest(@Body() dto: IngestEventDto, @Res() res: Response) {
    const result = await this.ingestionService.ingest(dto);

    const payload = {
      status: result.status,
      event_id: result.eventId,
      ...(result.message ? { message: result.message } : {}),
      ...(result.timestamp ? { timestamp: result.timestamp } : {}),
    };

    if (result.status === 'duplicate') {
      return res.status(HttpStatus.OK).json(payload);
    }

    return res.status(HttpStatus.ACCEPTED).json(payload);
  }
}
