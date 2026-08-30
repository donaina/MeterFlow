import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { StructuredLoggingInterceptor } from './common/interceptors/logging.interceptor';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule);

  app.enableCors({
    origin: '*',
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.useGlobalInterceptors(new StructuredLoggingInterceptor());

  // Configure OpenAPI / Swagger Documentation
  const swaggerConfig = new DocumentBuilder()
    .setTitle('MeterFlow — Usage-Based Billing & Metering Engine')
    .setDescription(
      'MeterFlow is a high-throughput, financially accurate usage metering and subscription billing engine with database-enforced idempotency, hybrid Redis aggregation, versioned JSONB pricing strategies, and balanced double-entry accounting ledger.',
    )
    .setVersion('1.0.0')
    .addTag('Health', 'Liveness and database/Redis connectivity probes')
    .addTag('Ingestion', 'Idempotent append-only usage event ingestion')
    .addTag('Aggregation', 'Real-time usage aggregation and flush management')
    .addTag('Plans', 'Config-driven pricing plans and schema versioning')
    .addTag('Pricing', 'Real-time pricing strategy preview and evaluation')
    .addTag('Invoices', 'Atomic immutable invoice generation and line items')
    .addTag('Ledger', 'Double-entry accounting journal audit and balance invariant verification')
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document);

  const port = process.env.PORT || 3000;
  await app.listen(port);
  logger.log(`MeterFlow Billing & Metering Engine is running on port ${port}`);
  logger.log(`OpenAPI Swagger documentation available at http://localhost:${port}/api/docs`);
}

bootstrap();
