import { PerUnitStrategy } from './per-unit.strategy';

describe('PerUnitStrategy', () => {
  let strategy: PerUnitStrategy;

  beforeEach(() => {
    strategy = new PerUnitStrategy();
  });

  it('should calculate simple per-unit cost without free allowance', () => {
    const result = strategy.calculate(500, { rate_cents: 3 }, 'api_calls');
    expect(result.amountCents).toBe(1500); // 500 * 3
    expect(result.details?.billableUnits).toBe(500);
  });

  it('should apply free allowance correctly', () => {
    const result = strategy.calculate(500, { rate_cents: 3, free_allowance: 200 }, 'api_calls');
    expect(result.amountCents).toBe(900); // (500 - 200) * 3 = 900
    expect(result.details?.freeAllowance).toBe(200);
    expect(result.details?.billableUnits).toBe(300);
  });

  it('should charge 0 if usage is within free allowance', () => {
    const result = strategy.calculate(150, { rate_cents: 5, free_allowance: 200 }, 'api_calls');
    expect(result.amountCents).toBe(0);
    expect(result.details?.billableUnits).toBe(0);
  });
});
