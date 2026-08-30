import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { AggregationService, AggregateEventInput } from './aggregation.service';

@Injectable()
@Processor('events-queue')
export class AggregationProcessor extends WorkerHost {
  private readonly logger = new Logger(AggregationProcessor.name);

  constructor(private readonly aggregationService: AggregationService) {
    super();
  }

  async process(job: Job<AggregateEventInput, any, string>): Promise<any> {
    this.logger.debug(`Processing event job ${job.id} for customer ${job.data.customerId}`);
    return this.aggregationService.aggregateEvent(job.data);
  }
}
