import { IsOptional, IsString, IsObject, ValidateIf } from 'class-validator';
import { PlanPricingConfig } from '../interfaces/pricing-strategy.interface';
import { UsageQuantityMap } from '../pricing.service';

export class PreviewPricingDto {
  @IsOptional()
  @IsString({ message: 'plan_id must be a string' })
  plan_id?: string;

  @IsOptional()
  @IsObject({ message: 'pricing_config must be an object' })
  pricing_config?: PlanPricingConfig;

  @IsObject({ message: 'usage must be an object map of feature keys to quantities' })
  usage!: UsageQuantityMap;
}
