import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { IngestEventDto } from './dto/ingest-event.dto';
import { Prisma } from '@prisma/client';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { AggregationService } from '../aggregation/aggregation.service';

export interface IngestionResult {
  status: 'accepted' | 'duplicate';
  eventId: string;
  message?: string;
  timestamp?: string;
}

@Injectable()
export class IngestionService {
  private readonly logger = new Logger(IngestionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly aggregationService: AggregationService,
    @InjectQueue('events-queue') private readonly eventsQueue: Queue,
  ) {}

  /**
   * Ingest a usage event idempotently.
   * Strictly append-only: inserts a new row or detects duplicates via DB unique constraint.
   */
  async ingest(dto: IngestEventDto): Promise<IngestionResult> {
    // 1. Ensure customer exists to satisfy relational integrity
    try {
      await this.prisma.customer.upsert({
        where: { id: dto.customer_id },
        update: {},
        create: {
          id: dto.customer_id,
          name: `Customer ${dto.customer_id}`,
          email: `${dto.customer_id}@example.com`,
        },
      });
    } catch (custErr: any) {
      // If concurrent upserts race on customer creation, ignore duplicate customer P2002
      if (!(custErr instanceof Prisma.PrismaClientKnownRequestError && custErr.code === 'P2002')) {
        this.logger.error(`Error ensuring customer ${dto.customer_id}:`, custErr);
        throw custErr;
      }
    }

    // 2. Insert raw usage event into append-only usage_events table
    try {
      const createdEvent = await this.prisma.usageEvent.create({
        data: {
          eventId: dto.event_id,
          customerId: dto.customer_id,
          featureKey: dto.feature_key,
          quantity: BigInt(dto.quantity),
          timestamp: new Date(dto.timestamp),
          metadata: dto.metadata || {},
        },
      });

      this.logger.log(`Usage event accepted: ${createdEvent.eventId} for customer: ${createdEvent.customerId}`);

      // Enqueue to asynchronous BullMQ aggregation worker
      const eventPayload = {
        customerId: dto.customer_id,
        featureKey: dto.feature_key,
        quantity: dto.quantity,
        timestamp: dto.timestamp,
      };

      try {
        await this.eventsQueue.add('process-event', eventPayload, {
          jobId: dto.event_id,
          removeOnComplete: true,
        });
      } catch (queueErr: any) {
        this.logger.warn(
          `Could not enqueue event to BullMQ (${queueErr.message}). Invoking direct aggregation fallback.`,
        );
        await this.aggregationService.aggregateEvent(eventPayload);
      }

      return {
        status: 'accepted',
        eventId: dto.event_id,
        timestamp: createdEvent.createdAt.toISOString(),
      };
    } catch (error: any) {
      // Handle PostgreSQL unique constraint violation on event_id (Prisma error code P2002)
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        this.logger.warn(`Duplicate usage event rejected at DB level: ${dto.event_id}`);
        return {
          status: 'duplicate',
          eventId: dto.event_id,
          message: 'Event already recorded',
        };
      }

      this.logger.error(`Error during event ingestion for event ${dto.event_id}:`, error);
      throw error;
    }
  }

  /**
   * Fetch event by eventId for audit and verification.
   * Note: No UPDATE or DELETE operations exist for usage_events.
   */
  async findByEventId(eventId: string) {
    const event = await this.prisma.usageEvent.findUnique({
      where: { eventId },
    });

    if (!event) return null;

    return {
      ...event,
      quantity: Number(event.quantity),
    };
  }

  /**
   * Count total events stored for a customer.
   */
  async countEventsForCustomer(customerId: string): Promise<number> {
    return this.prisma.usageEvent.count({
      where: { customerId },
    });
  }
}
