import { PeriodUtil } from './period.util';

describe('PeriodUtil', () => {
  it('should calculate accurate month start and end for regular dates', () => {
    const period = PeriodUtil.getMonthlyPeriod('2026-08-15T14:30:00.000Z');
    expect(period.periodKey).toBe('2026-08');
    expect(period.periodStart.toISOString()).toBe('2026-08-01T00:00:00.000Z');
    expect(period.periodEnd.toISOString()).toBe('2026-08-31T23:59:59.999Z');
  });

  it('should handle leap year February accurately', () => {
    const period = PeriodUtil.getMonthlyPeriod('2028-02-10T05:00:00.000Z');
    expect(period.periodKey).toBe('2028-02');
    expect(period.periodStart.toISOString()).toBe('2028-02-01T00:00:00.000Z');
    expect(period.periodEnd.toISOString()).toBe('2028-02-29T23:59:59.999Z');
  });

  it('should format and parse Redis counter keys accurately', () => {
    const key = PeriodUtil.getCounterKey('cust_123', 'zap_runs', '2026-08');
    expect(key).toBe('usage:cust_123:zap_runs:2026-08');

    const parsed = PeriodUtil.parseCounterKey(key);
    expect(parsed).toEqual({
      customerId: 'cust_123',
      featureKey: 'zap_runs',
      periodKey: '2026-08',
    });
  });

  it('should return null for invalid counter keys', () => {
    expect(PeriodUtil.parseCounterKey('invalid_key')).toBeNull();
    expect(PeriodUtil.parseCounterKey('other:cust:feature')).toBeNull();
  });
});
