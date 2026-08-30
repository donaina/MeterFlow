import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { PeriodUtil } from './utils/period.util';

export interface AggregateEventInput {
  customerId: string;
  featureKey: string;
  quantity: number;
  timestamp: Date | string;
}

export interface CustomerUsageItem {
  customerId: string;
  featureKey: string;
  periodKey: string;
  periodStart: Date;
  periodEnd: Date;
  durableQuantity: number;
  pendingQuantity: number;
  totalQuantity: number;
}

@Injectable()
export class AggregationService {
  private readonly logger = new Logger(AggregationService.name);
  private static readonly DIRTY_KEYS_SET = 'usage:dirty_keys';

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  /**
   * Increment in-memory counter with fallback to direct durable DB write if Redis is unavailable.
   */
  async aggregateEvent(input: AggregateEventInput): Promise<{ success: boolean; path: 'redis' | 'durable_fallback' }> {
    const period = PeriodUtil.getMonthlyPeriod(input.timestamp);
    const counterKey = PeriodUtil.getCounterKey(input.customerId, input.featureKey, period.periodKey);

    try {
      const redisClient = this.redis.getClient();
      if (!redisClient || redisClient.status !== 'ready') {
        throw new Error(`Redis client not ready (status: ${redisClient?.status})`);
      }

      // Fast in-memory counter increment
      await redisClient.incrby(counterKey, input.quantity);
      await redisClient.sadd(AggregationService.DIRTY_KEYS_SET, counterKey);

      this.logger.debug(
        `In-memory counter incremented for ${counterKey} (+${input.quantity}). Period: ${period.periodKey}`,
      );

      return { success: true, path: 'redis' };
    } catch (redisError: any) {
      this.logger.warn(
        `Redis unavailable (${redisError.message}). Executing durable DB fallback for customer ${input.customerId}`,
      );

      // Durable fallback path directly in PostgreSQL
      await this.durableFallbackWrite(
        input.customerId,
        input.featureKey,
        period.periodStart,
        period.periodEnd,
        BigInt(input.quantity),
      );

      return { success: true, path: 'durable_fallback' };
    }
  }

  /**
   * Atomic PostgreSQL upsert for fallback write and flush operations.
   */
  private async durableFallbackWrite(
    customerId: string,
    featureKey: string,
    periodStart: Date,
    periodEnd: Date,
    quantity: bigint,
  ) {
    // Ensure customer exists
    await this.prisma.customer.upsert({
      where: { id: customerId },
      update: {},
      create: {
        id: customerId,
        name: `Customer ${customerId}`,
        email: `${customerId}@example.com`,
      },
    });

    await this.prisma.$executeRaw`
      INSERT INTO usage_records (id, customer_id, feature_key, period_start, period_end, quantity, created_at, updated_at)
      VALUES (gen_random_uuid(), ${customerId}, ${featureKey}, ${periodStart}, ${periodEnd}, ${quantity}, NOW(), NOW())
      ON CONFLICT (customer_id, feature_key, period_start, period_end)
      DO UPDATE SET quantity = usage_records.quantity + EXCLUDED.quantity, updated_at = NOW();
    `;
  }

  /**
   * Flush all active in-memory counters to PostgreSQL usage_records.
   */
  async flushCountersToDatabase(): Promise<{ flushedKeysCount: number; syncedEventsCount: number }> {
    const redisClient = this.redis.getClient();
    if (!redisClient || redisClient.status !== 'ready') {
      this.logger.warn('Cannot flush counters: Redis client is not ready');
      return { flushedKeysCount: 0, syncedEventsCount: 0 };
    }

    // Get all dirty keys tracked in Redis
    const dirtyKeys = await redisClient.smembers(AggregationService.DIRTY_KEYS_SET);
    if (!dirtyKeys || dirtyKeys.length === 0) {
      return { flushedKeysCount: 0, syncedEventsCount: 0 };
    }

    let flushedKeysCount = 0;
    let syncedEventsCount = 0;

    for (const key of dirtyKeys) {
      const parsed = PeriodUtil.parseCounterKey(key);
      if (!parsed) {
        await redisClient.srem(AggregationService.DIRTY_KEYS_SET, key);
        continue;
      }

      // Atomic fetch and reset of pending count
      const rawCount = await redisClient.getset(key, '0');
      const pendingQuantity = parseInt(rawCount || '0', 10);

      if (pendingQuantity > 0) {
        const period = PeriodUtil.getMonthlyPeriod(`${parsed.periodKey}-01T00:00:00.000Z`);

        await this.durableFallbackWrite(
          parsed.customerId,
          parsed.featureKey,
          period.periodStart,
          period.periodEnd,
          BigInt(pendingQuantity),
        );

        syncedEventsCount += pendingQuantity;
        flushedKeysCount++;
      }

      // Remove from dirty keys set
      await redisClient.srem(AggregationService.DIRTY_KEYS_SET, key);
    }

    this.logger.log(`Flushed ${flushedKeysCount} dirty counter keys (${syncedEventsCount} units) to PostgreSQL`);
    return { flushedKeysCount, syncedEventsCount };
  }

  /**
   * Retrieve total aggregated usage for a customer across all features and periods,
   * combining durable PostgreSQL records with active pending Redis counters.
   */
  async getUsageForCustomer(customerId: string): Promise<CustomerUsageItem[]> {
    // 1. Fetch durable records from PostgreSQL
    const durableRecords = await this.prisma.usageRecord.findMany({
      where: { customerId },
      orderBy: [{ periodStart: 'desc' }, { featureKey: 'asc' }],
    });

    const resultsMap = new Map<string, CustomerUsageItem>();

    for (const record of durableRecords) {
      const period = PeriodUtil.getMonthlyPeriod(record.periodStart);
      const compositeKey = `${record.featureKey}:${period.periodKey}`;
      resultsMap.set(compositeKey, {
        customerId,
        featureKey: record.featureKey,
        periodKey: period.periodKey,
        periodStart: record.periodStart,
        periodEnd: record.periodEnd,
        durableQuantity: Number(record.quantity),
        pendingQuantity: 0,
        totalQuantity: Number(record.quantity),
      });
    }

    // 2. Fetch active pending in-memory Redis counters
    try {
      const redisClient = this.redis.getClient();
      if (redisClient && redisClient.status === 'ready') {
        const pattern = `usage:${customerId}:*`;
        const keys = await redisClient.keys(pattern);

        for (const key of keys) {
          const parsed = PeriodUtil.parseCounterKey(key);
          if (!parsed) continue;

          const rawPending = await redisClient.get(key);
          const pendingQuantity = parseInt(rawPending || '0', 10);
          if (pendingQuantity <= 0) continue;

          const compositeKey = `${parsed.featureKey}:${parsed.periodKey}`;
          const existing = resultsMap.get(compositeKey);

          if (existing) {
            existing.pendingQuantity = pendingQuantity;
            existing.totalQuantity = existing.durableQuantity + pendingQuantity;
          } else {
            const period = PeriodUtil.getMonthlyPeriod(`${parsed.periodKey}-01T00:00:00.000Z`);
            resultsMap.set(compositeKey, {
              customerId,
              featureKey: parsed.featureKey,
              periodKey: parsed.periodKey,
              periodStart: period.periodStart,
              periodEnd: period.periodEnd,
              durableQuantity: 0,
              pendingQuantity,
              totalQuantity: pendingQuantity,
            });
          }
        }
      }
    } catch (err: any) {
      this.logger.warn(`Could not fetch live pending Redis counters for customer ${customerId}: ${err.message}`);
    }

    return Array.from(resultsMap.values());
  }
}
