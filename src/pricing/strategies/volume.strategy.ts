import { Injectable } from '@nestjs/common';
import { PricingStrategy, VolumeConfig, LineItemBreakdown } from '../interfaces/pricing-strategy.interface';

@Injectable()
export class VolumeStrategy implements PricingStrategy {
  readonly type = 'volume';

  calculate(quantity: number, config: VolumeConfig, featureKey?: string): LineItemBreakdown {
    const rawQuantity = Math.max(0, Math.floor(Number(quantity || 0)));
    const tiers = (config.tiers || []).slice().sort((a, b) => a.from - b.from);

    // Find the single tier that applies to the entire volume
    let matchingTier = tiers[0] || { from: 0, to: null, rate_cents: 0 };
    for (const tier of tiers) {
      if (rawQuantity >= tier.from) {
        if (tier.to === null || tier.to === undefined || rawQuantity <= tier.to) {
          matchingTier = tier;
          break;
        }
        matchingTier = tier;
      }
    }

    const rateCents = Math.round(Number(matchingTier.rate_cents || 0));
    const amountCents = rawQuantity * rateCents;

    return {
      featureKey,
      description: config.description || `Volume pricing for ${featureKey || 'feature'}`,
      quantity: rawQuantity,
      amountCents,
      details: {
        rateCents,
      },
    };
  }
}
