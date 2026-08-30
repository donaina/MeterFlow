import { Injectable, Logger } from '@nestjs/common';
import { PricingStrategy } from '../interfaces/pricing-strategy.interface';
import { FlatFeeStrategy } from './flat-fee.strategy';
import { PerUnitStrategy } from './per-unit.strategy';
import { TieredGraduatedStrategy } from './tiered-graduated.strategy';
import { VolumeStrategy } from './volume.strategy';

@Injectable()
export class PricingStrategyRegistry {
  private readonly logger = new Logger(PricingStrategyRegistry.name);
  private readonly strategies = new Map<string, PricingStrategy>();

  constructor(
    flatFeeStrategy: FlatFeeStrategy,
    perUnitStrategy: PerUnitStrategy,
    tieredGraduatedStrategy: TieredGraduatedStrategy,
    volumeStrategy: VolumeStrategy,
  ) {
    this.register(flatFeeStrategy);
    this.register(perUnitStrategy);
    this.register(tieredGraduatedStrategy);
    this.register(volumeStrategy);
  }

  register(strategy: PricingStrategy) {
    this.strategies.set(strategy.type, strategy);
    this.logger.debug(`Registered pricing strategy: ${strategy.type}`);
  }

  get(type: string): PricingStrategy {
    const strategy = this.strategies.get(type);
    if (!strategy) {
      throw new Error(`Unsupported pricing strategy type: "${type}". Supported: ${Array.from(this.strategies.keys()).join(', ')}`);
    }
    return strategy;
  }
}
