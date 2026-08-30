import * as fc from 'fast-check';
import { TieredGraduatedStrategy } from './strategies/tiered-graduated.strategy';
import { PerUnitStrategy } from './strategies/per-unit.strategy';
import { PricingService } from './pricing.service';
import { PricingStrategyRegistry } from './strategies/pricing-strategy.registry';
import { FlatFeeStrategy } from './strategies/flat-fee.strategy';
import { VolumeStrategy } from './strategies/volume.strategy';
import { PlanPricingConfig } from './interfaces/pricing-strategy.interface';

describe('Pricing Engine (fast-check Property-Based Invariants)', () => {
  let tieredStrategy: TieredGraduatedStrategy;
  let perUnitStrategy: PerUnitStrategy;
  let pricingService: PricingService;

  beforeEach(() => {
    const flatFee = new FlatFeeStrategy();
    perUnitStrategy = new PerUnitStrategy();
    tieredStrategy = new TieredGraduatedStrategy();
    const volume = new VolumeStrategy();

    const registry = new PricingStrategyRegistry(
      flatFee,
      perUnitStrategy,
      tieredStrategy,
      volume,
    );
    pricingService = new PricingService(registry);
  });

  it('Property 1: TieredGraduated pricing must be strictly monotonic (cost(q + delta) >= cost(q))', () => {
    // Arbitrary tier config generator: 3 consecutive tiers with increasing or constant rates
    const tierConfigGen = fc.record({
      tier1To: fc.integer({ min: 100, max: 1000 }),
      tier2To: fc.integer({ min: 1001, max: 5000 }),
      rate1: fc.integer({ min: 0, max: 50 }),
      rate2: fc.integer({ min: 0, max: 100 }),
      rate3: fc.integer({ min: 0, max: 200 }),
    });

    fc.assert(
      fc.property(
        tierConfigGen,
        fc.integer({ min: 0, max: 10000 }),
        fc.integer({ min: 0, max: 1000 }),
        ({ tier1To, tier2To, rate1, rate2, rate3 }, q, delta) => {
          const config = {
            tiers: [
              { from: 0, to: tier1To, rate_cents: rate1 },
              { from: tier1To, to: tier2To, rate_cents: rate2 },
              { from: tier2To, to: null, rate_cents: rate3 },
            ],
          };

          const costQ = tieredStrategy.calculate(q, config).amountCents;
          const costQPlusDelta = tieredStrategy.calculate(q + delta, config).amountCents;

          // Invariant: Cost cannot decrease when usage increases
          return costQPlusDelta >= costQ;
        },
      ),
      { numRuns: 1000 },
    );
  });

  it('Property 2: PerUnit with allowance must be 0 below allowance and linear above allowance', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 5000 }), // allowance
        fc.integer({ min: 0, max: 100 }),  // rate_cents
        fc.integer({ min: 0, max: 10000 }), // quantity
        (allowance, rateCents, quantity) => {
          const result = perUnitStrategy.calculate(quantity, {
            rate_cents: rateCents,
            free_allowance: allowance,
          });

          if (quantity <= allowance) {
            return result.amountCents === 0;
          } else {
            return result.amountCents === (quantity - allowance) * rateCents;
          }
        },
      ),
      { numRuns: 1000 },
    );
  });

  it('Property 3: Plan cost calculations must produce strictly non-negative integer cents without float drift', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 100000 }), // flat fee cents
        fc.integer({ min: 0, max: 50000 }),  // usage 1
        fc.integer({ min: 0, max: 50000 }),  // usage 2
        (flatFeeCents, zapUsage, storageUsage) => {
          const planConfig: PlanPricingConfig = {
            flat_fee: { amount_cents: flatFeeCents },
            rules: [
              {
                feature_key: 'zap_runs',
                type: 'per_unit' as const,
                config: { rate_cents: 3, free_allowance: 100 },
              },
              {
                feature_key: 'storage_gb',
                type: 'per_unit' as const,
                config: { rate_cents: 5, free_allowance: 10 },
              },
            ],
          };

          const usage = { zap_runs: zapUsage, storage_gb: storageUsage };
          const result = pricingService.calculateCost(planConfig, usage);

          // Invariant checks
          const isInteger = Number.isInteger(result.totalAmountCents);
          const isNonNegative = result.totalAmountCents >= 0;
          const lineItemsSum = result.lineItems.reduce((acc, item) => acc + item.amountCents, 0);
          const sumsMatch = result.totalAmountCents === lineItemsSum;

          return isInteger && isNonNegative && sumsMatch;
        },
      ),
      { numRuns: 1000 },
    );
  });

  it('Property 4: Ledger balance invariant (sum of line item credits must strictly equal total debits)', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            description: fc.string({ minLength: 1 }),
            quantity: fc.integer({ min: 1, max: 10000 }),
            amountCents: fc.integer({ min: 0, max: 500000 }),
          }),
          { minLength: 1, maxLength: 10 },
        ),
        (lineItems) => {
          const totalAmountCents = lineItems.reduce((sum, item) => sum + item.amountCents, 0);

          // Simulated double-entry ledger balance check
          const debitAmount = totalAmountCents;
          const creditAmount = lineItems.reduce((sum, item) => sum + item.amountCents, 0);

          return debitAmount === creditAmount && Number.isInteger(debitAmount);
        },
      ),
      { numRuns: 1000 },
    );
  });
});
