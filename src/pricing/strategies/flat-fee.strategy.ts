import { Injectable } from '@nestjs/common';
import { PricingStrategy, FlatFeeConfig, LineItemBreakdown } from '../interfaces/pricing-strategy.interface';

@Injectable()
export class FlatFeeStrategy implements PricingStrategy {
  readonly type = 'flat_fee';

  calculate(_quantity: number, config: FlatFeeConfig, featureKey?: string): LineItemBreakdown {
    const amountCents = Math.round(Number(config.amount_cents || 0));

    return {
      featureKey,
      description: config.description || 'Base Subscription Fee',
      quantity: 1,
      amountCents,
    };
  }
}
