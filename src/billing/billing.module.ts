import { Module } from '@nestjs/common';
import { BillingService } from './billing.service';
import { BillingController } from './billing.controller';
import { AggregationModule } from '../aggregation/aggregation.module';
import { PricingModule } from '../pricing/pricing.module';
import { LedgerModule } from '../ledger/ledger.module';
import { PlansModule } from '../plans/plans.module';

@Module({
  imports: [AggregationModule, PricingModule, LedgerModule, PlansModule],
  controllers: [BillingController],
  providers: [BillingService],
  exports: [BillingService],
})
export class BillingModule {}
