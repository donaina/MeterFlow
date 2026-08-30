import { Injectable } from '@nestjs/common';
import {
  PricingStrategy,
  TieredGraduatedConfig,
  LineItemBreakdown,
  TierCalculationItem,
} from '../interfaces/pricing-strategy.interface';

@Injectable()
export class TieredGraduatedStrategy implements PricingStrategy {
  readonly type = 'tiered_graduated';

  calculate(quantity: number, config: TieredGraduatedConfig, featureKey?: string): LineItemBreakdown {
    const rawQuantity = Math.max(0, Math.floor(Number(quantity || 0)));
    const tiers = (config.tiers || []).slice().sort((a, b) => a.from - b.from);

    let totalAmountCents = 0;
    const tierCalculations: TierCalculationItem[] = [];

    for (let i = 0; i < tiers.length; i++) {
      const tier = tiers[i];
      const from = Math.max(0, tier.from);
      const to = tier.to !== null && tier.to !== undefined ? Math.max(from, tier.to) : null;
      const rateCents = Math.round(Number(tier.rate_cents || 0));

      let unitsInTier = 0;

      if (rawQuantity > from) {
        if (to === null) {
          unitsInTier = rawQuantity - from;
        } else {
          unitsInTier = Math.min(rawQuantity, to) - from;
        }
      }

      const subtotalCents = unitsInTier * rateCents;
      totalAmountCents += subtotalCents;

      tierCalculations.push({
        tierIndex: i + 1,
        from,
        to,
        unitsInTier,
        rateCents,
        subtotalCents,
      });
    }

    return {
      featureKey,
      description: config.description || `Graduated tiered pricing for ${featureKey || 'feature'}`,
      quantity: rawQuantity,
      amountCents: totalAmountCents,
      details: {
        tiers: tierCalculations,
      },
    };
  }
}
