import { Injectable, Logger } from '@nestjs/common';
import { PricingStrategyRegistry } from './strategies/pricing-strategy.registry';
import {
  PlanPricingConfig,
  PlanCostCalculationResult,
  LineItemBreakdown,
} from './interfaces/pricing-strategy.interface';

export interface UsageQuantityMap {
  [featureKey: string]: number;
}

@Injectable()
export class PricingService {
  private readonly logger = new Logger(PricingService.name);

  constructor(private readonly registry: PricingStrategyRegistry) {}

  /**
   * Calculate full plan cost for a set of feature usage quantities.
   */
  calculateCost(
    pricingConfig: PlanPricingConfig,
    usage: UsageQuantityMap = {},
    planMeta?: { planId?: string; planVersion?: number },
  ): PlanCostCalculationResult {
    const lineItems: LineItemBreakdown[] = [];
    let totalAmountCents = 0;

    // 1. Process base flat fee if present
    if (pricingConfig.flat_fee && pricingConfig.flat_fee.amount_cents > 0) {
      const flatFeeStrategy = this.registry.get('flat_fee');
      const flatLineItem = flatFeeStrategy.calculate(1, pricingConfig.flat_fee);
      lineItems.push(flatLineItem);
      totalAmountCents += flatLineItem.amountCents;
    }

    // 2. Process all configured pricing rules
    if (Array.isArray(pricingConfig.rules)) {
      for (const rule of pricingConfig.rules) {
        const strategy = this.registry.get(rule.type);
        const featureKey = rule.feature_key;
        const quantity = featureKey ? usage[featureKey] || 0 : 0;

        const lineItem = strategy.calculate(quantity, rule.config, featureKey);
        lineItems.push(lineItem);
        totalAmountCents += lineItem.amountCents;
      }
    }

    return {
      planId: planMeta?.planId,
      planVersion: planMeta?.planVersion,
      totalAmountCents,
      lineItems,
    };
  }
}
