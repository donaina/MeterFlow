import { IsNotEmpty, IsString, IsISO8601, IsOptional } from 'class-validator';

export class GenerateInvoiceDto {
  @IsNotEmpty({ message: 'customer_id must not be empty' })
  @IsString({ message: 'customer_id must be a string' })
  customer_id!: string;

  @IsOptional()
  @IsString({ message: 'plan_id must be a string' })
  plan_id?: string;

  @IsNotEmpty({ message: 'period_start must not be empty' })
  @IsISO8601({}, { message: 'period_start must be a valid ISO8601 string' })
  period_start!: string;

  @IsNotEmpty({ message: 'period_end must not be empty' })
  @IsISO8601({}, { message: 'period_end must be a valid ISO8601 string' })
  period_end!: string;
}
