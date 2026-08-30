import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { AggregationService } from './aggregation.service';
import { AggregationProcessor } from './aggregation.processor';
import { AggregationController } from './aggregation.controller';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'events-queue',
    }),
  ],
  controllers: [AggregationController],
  providers: [AggregationService, AggregationProcessor],
  exports: [AggregationService, BullModule],
})
export class AggregationModule {}
