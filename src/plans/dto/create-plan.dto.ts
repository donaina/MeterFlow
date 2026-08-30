import { IsNotEmpty, IsString, IsObject, IsOptional } from 'class-validator';
import { PlanPricingConfig } from '../../pricing/interfaces/pricing-strategy.interface';

export class CreatePlanDto {
  @IsNotEmpty({ message: 'name must not be empty' })
  @IsString({ message: 'name must be a string' })
  name!: string;

  @IsNotEmpty({ message: 'pricing_config must not be empty' })
  @IsObject({ message: 'pricing_config must be an object' })
  pricing_config!: PlanPricingConfig;
}

export class UpdatePlanDto {
  @IsOptional()
  @IsString({ message: 'name must be a string' })
  name?: string;

  @IsOptional()
  @IsObject({ message: 'pricing_config must be an object' })
  pricing_config?: PlanPricingConfig;
}
