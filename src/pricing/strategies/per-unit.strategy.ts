import { Injectable } from '@nestjs/common';
import { PricingStrategy, PerUnitConfig, LineItemBreakdown } from '../interfaces/pricing-strategy.interface';

@Injectable()
export class PerUnitStrategy implements PricingStrategy {
  readonly type = 'per_unit';

  calculate(quantity: number, config: PerUnitConfig, featureKey?: string): LineItemBreakdown {
    const rawQuantity = Math.max(0, Math.floor(Number(quantity || 0)));
    const freeAllowance = Math.max(0, Math.floor(Number(config.free_allowance || 0)));
    const billableUnits = Math.max(0, rawQuantity - freeAllowance);
    const rateCents = Math.round(Number(config.rate_cents || 0));

    const amountCents = billableUnits * rateCents;

    return {
      featureKey,
      description: config.description || `Usage charge for ${featureKey || 'feature'}`,
      quantity: rawQuantity,
      amountCents,
      details: {
        rateCents,
        freeAllowance,
        billableUnits,
      },
    };
  }
}
