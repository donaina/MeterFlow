import { Test, TestingModule } from '@nestjs/testing';
import { PricingService } from './pricing.service';
import { PricingStrategyRegistry } from './strategies/pricing-strategy.registry';
import { FlatFeeStrategy } from './strategies/flat-fee.strategy';
import { PerUnitStrategy } from './strategies/per-unit.strategy';
import { TieredGraduatedStrategy } from './strategies/tiered-graduated.strategy';
import { VolumeStrategy } from './strategies/volume.strategy';
import { PlanPricingConfig } from './interfaces/pricing-strategy.interface';

describe('PricingService (Multi-Feature Pricing Engine)', () => {
  let service: PricingService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PricingService,
        PricingStrategyRegistry,
        FlatFeeStrategy,
        PerUnitStrategy,
        TieredGraduatedStrategy,
        VolumeStrategy,
      ],
    }).compile();

    service = module.get<PricingService>(PricingService);
  });

  it('should calculate complete plan cost with base flat fee + multi-feature usage', () => {
    const planConfig: PlanPricingConfig = {
      flat_fee: {
        amount_cents: 4900, // $49/month base fee
        description: 'Pro Plan Base Subscription',
      },
      rules: [
        {
          feature_key: 'zap_runs',
          type: 'tiered_graduated',
          config: {
            description: 'Zap Runs',
            tiers: [
              { from: 0, to: 1000, rate_cents: 0 },
              { from: 1000, to: 5000, rate_cents: 4 },
              { from: 5000, to: null, rate_cents: 2 },
            ],
          },
        },
        {
          feature_key: 'storage_gb',
          type: 'per_unit',
          config: {
            description: 'Additional Storage',
            rate_cents: 10, // 10¢ per GB
            free_allowance: 50, // 50 GB free
          },
        },
      ],
    };

    const usage = {
      zap_runs: 3500,  // Base flat: 4900¢, Zaps: (1000@0 + 2500@4 = 10000¢) = 10000¢
      storage_gb: 75,  // Storage: (75 - 50 = 25) * 10 = 250¢
    };

    const result = service.calculateCost(planConfig, usage, { planId: 'plan_pro', planVersion: 2 });

    expect(result.planId).toBe('plan_pro');
    expect(result.planVersion).toBe(2);
    expect(result.lineItems.length).toBe(3);

    // Flat fee line item
    expect(result.lineItems[0].amountCents).toBe(4900);
    // Zap runs line item
    expect(result.lineItems[1].amountCents).toBe(10000);
    // Storage line item
    expect(result.lineItems[2].amountCents).toBe(250);

    // Total: 4900 + 10000 + 250 = 15150 cents ($151.50)
    expect(result.totalAmountCents).toBe(15150);
  });
});
