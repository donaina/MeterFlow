import { TieredGraduatedStrategy } from './tiered-graduated.strategy';
import { TieredGraduatedConfig } from '../interfaces/pricing-strategy.interface';

describe('TieredGraduatedStrategy (Tier Boundary Tests)', () => {
  let strategy: TieredGraduatedStrategy;

  // Sample config:
  // Tier 1: 0 - 1,000 units @ 0 cents (free)
  // Tier 2: 1,000 - 5,000 units @ 5 cents/unit (capacity: 4,000 units)
  // Tier 3: > 5,000 units @ 2 cents/unit (open-ended)
  const config: TieredGraduatedConfig = {
    tiers: [
      { from: 0, to: 1000, rate_cents: 0 },
      { from: 1000, to: 5000, rate_cents: 5 },
      { from: 5000, to: null, rate_cents: 2 },
    ],
  };

  beforeEach(() => {
    strategy = new TieredGraduatedStrategy();
  });

  it('should calculate 0 cents for 0 units', () => {
    const result = strategy.calculate(0, config, 'tasks');
    expect(result.amountCents).toBe(0);
    expect(result.quantity).toBe(0);
  });

  it('should calculate 0 cents for exactly 1,000 units (exact tier 1 boundary)', () => {
    const result = strategy.calculate(1000, config, 'tasks');
    expect(result.amountCents).toBe(0);
    expect(result.details?.tiers?.[0].unitsInTier).toBe(1000);
    expect(result.details?.tiers?.[1].unitsInTier).toBe(0);
  });

  it('should charge 5 cents for 1,001 units (1 unit in tier 2)', () => {
    const result = strategy.calculate(1001, config, 'tasks');
    expect(result.amountCents).toBe(5);
    expect(result.details?.tiers?.[0].unitsInTier).toBe(1000);
    expect(result.details?.tiers?.[1].unitsInTier).toBe(1);
    expect(result.details?.tiers?.[2].unitsInTier).toBe(0);
  });

  it('should charge exactly 20,000 cents ($200) for 5,000 units (tier 2 upper boundary)', () => {
    // 1000 @ 0 + 4000 @ 5 = 20000 cents
    const result = strategy.calculate(5000, config, 'tasks');
    expect(result.amountCents).toBe(20000);
    expect(result.details?.tiers?.[0].unitsInTier).toBe(1000);
    expect(result.details?.tiers?.[1].unitsInTier).toBe(4000);
    expect(result.details?.tiers?.[2].unitsInTier).toBe(0);
  });

  it('should charge 25,000 cents ($250) for 7,500 units (spanning into open-ended tier 3)', () => {
    // 1000 @ 0 + 4000 @ 5 (20000) + 2500 @ 2 (5000) = 25000 cents
    const result = strategy.calculate(7500, config, 'tasks');
    expect(result.amountCents).toBe(25000);
    expect(result.details?.tiers?.[0].unitsInTier).toBe(1000);
    expect(result.details?.tiers?.[1].unitsInTier).toBe(4000);
    expect(result.details?.tiers?.[2].unitsInTier).toBe(2500);
  });
});
