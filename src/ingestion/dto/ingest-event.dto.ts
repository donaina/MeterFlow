import { IsNotEmpty, IsString, IsInt, Min, IsISO8601, IsOptional, IsObject } from 'class-validator';

export class IngestEventDto {
  @IsNotEmpty({ message: 'event_id must not be empty' })
  @IsString({ message: 'event_id must be a string' })
  event_id!: string;

  @IsNotEmpty({ message: 'customer_id must not be empty' })
  @IsString({ message: 'customer_id must be a string' })
  customer_id!: string;

  @IsNotEmpty({ message: 'feature_key must not be empty' })
  @IsString({ message: 'feature_key must be a string' })
  feature_key!: string;

  @IsInt({ message: 'quantity must be an integer' })
  @Min(1, { message: 'quantity must be greater than or equal to 1' })
  quantity!: number;

  @IsNotEmpty({ message: 'timestamp must not be empty' })
  @IsISO8601({}, { message: 'timestamp must be a valid ISO8601 date string' })
  timestamp!: string;

  @IsOptional()
  @IsObject({ message: 'metadata must be an object' })
  metadata?: Record<string, any>;
}
