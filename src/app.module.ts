import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { HealthModule } from './health/health.module';
import { IngestionModule } from './ingestion/ingestion.module';
import { AggregationModule } from './aggregation/aggregation.module';
import { PlansModule } from './plans/plans.module';
import { PricingModule } from './pricing/pricing.module';
import { LedgerModule } from './ledger/ledger.module';
import { BillingModule } from './billing/billing.module';
import { CorrelationIdMiddleware } from './common/middleware/correlation-id.middleware';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env'],
    }),
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => {
        const redisUrl = configService.get<string>('REDIS_URL');
        if (redisUrl) {
          const urlObj = new URL(redisUrl);
          return {
            connection: {
              host: urlObj.hostname,
              port: Number(urlObj.port || 6379),
              username: urlObj.username || undefined,
              password: urlObj.password || undefined,
              tls: urlObj.protocol === 'rediss:' ? {} : undefined,
              maxRetriesPerRequest: null,
            },
          };
        }

        return {
          connection: {
            host: configService.get<string>('REDIS_HOST', 'localhost'),
            port: Number(configService.get<number>('REDIS_PORT', 6379)),
            password: configService.get<string>('REDIS_PASSWORD') || undefined,
            maxRetriesPerRequest: null,
          },
        };
      },
      inject: [ConfigService],
    }),
    PrismaModule,
    RedisModule,
    HealthModule,
    PlansModule,
    PricingModule,
    AggregationModule,
    IngestionModule,
    LedgerModule,
    BillingModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(CorrelationIdMiddleware).forRoutes('*');
  }
}
