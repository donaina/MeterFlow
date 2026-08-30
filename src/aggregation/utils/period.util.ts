export interface BillingPeriod {
  periodKey: string;     // e.g. "2026-08"
  periodStart: Date;     // e.g. 2026-08-01T00:00:00.000Z
  periodEnd: Date;       // e.g. 2026-08-31T23:59:59.999Z
}

export class PeriodUtil {
  /**
   * Determine calendar monthly billing period for any timestamp.
   * Handles UTC timestamps and month/year boundaries accurately.
   */
  static getMonthlyPeriod(dateInput: Date | string): BillingPeriod {
    const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
    const year = date.getUTCFullYear();
    const month = date.getUTCMonth(); // 0-indexed

    const periodStart = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0));
    // Day 0 of next month is the last day of the current month
    const periodEnd = new Date(Date.UTC(year, month + 1, 0, 23, 59, 59, 999));

    const monthPadded = String(month + 1).padStart(2, '0');
    const periodKey = `${year}-${monthPadded}`;

    return {
      periodKey,
      periodStart,
      periodEnd,
    };
  }

  /**
   * Format Redis key for in-memory fast usage counter.
   */
  static getCounterKey(customerId: string, featureKey: string, periodKey: string): string {
    return `usage:${customerId}:${featureKey}:${periodKey}`;
  }

  /**
   * Parse composite Redis counter key back into components.
   */
  static parseCounterKey(key: string): { customerId: string; featureKey: string; periodKey: string } | null {
    const parts = key.split(':');
    if (parts.length < 4 || parts[0] !== 'usage') {
      return null;
    }
    return {
      customerId: parts[1],
      featureKey: parts[2],
      periodKey: parts[3],
    };
  }
}
