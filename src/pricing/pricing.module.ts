import { Module } from '@nestjs/common';
import { PricingService } from './pricing.service';
import { PricingController } from './pricing.controller';
import { PricingStrategyRegistry } from './strategies/pricing-strategy.registry';
import { FlatFeeStrategy } from './strategies/flat-fee.strategy';
import { PerUnitStrategy } from './strategies/per-unit.strategy';
import { TieredGraduatedStrategy } from './strategies/tiered-graduated.strategy';
import { VolumeStrategy } from './strategies/volume.strategy';
import { PlansModule } from '../plans/plans.module';

@Module({
  imports: [PlansModule],
  controllers: [PricingController],
  providers: [
    PricingService,
    PricingStrategyRegistry,
    FlatFeeStrategy,
    PerUnitStrategy,
    TieredGraduatedStrategy,
    VolumeStrategy,
  ],
  exports: [PricingService, PricingStrategyRegistry],
})
export class PricingModule {}
