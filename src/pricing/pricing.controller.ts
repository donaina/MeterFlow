import { Controller, Post, Body, HttpStatus, Res } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Response } from 'express';
import { PricingService } from './pricing.service';
import { PlansService } from '../plans/plans.service';
import { PreviewPricingDto } from './dto/preview-pricing.dto';
import { PlanPricingConfig } from './interfaces/pricing-strategy.interface';

@ApiTags('Pricing')
@Controller('pricing')
export class PricingController {
  constructor(
    private readonly pricingService: PricingService,
    private readonly plansService: PlansService,
  ) {}

  @Post('preview')
  @ApiOperation({
    summary: 'Preview Real-Time Pricing & Line Item Breakdown',
    description: 'Calculates the cost of a given feature usage map under an active plan configuration or ad-hoc custom JSONB config in integer cents.',
  })
  @ApiResponse({ status: 200, description: 'Calculated pricing preview with line items' })
  @ApiResponse({ status: 404, description: 'Plan not found' })
  async preview(@Body() dto: PreviewPricingDto, @Res() res: Response) {
    let config: PlanPricingConfig;
    let planVersion = 1;

    if (dto.plan_id) {
      const plan = await this.plansService.findPlanById(dto.plan_id);
      config = plan.pricingConfig as unknown as PlanPricingConfig;
      planVersion = plan.version;
    } else if (dto.pricing_config) {
      config = dto.pricing_config as PlanPricingConfig;
    } else {
      config = { rules: [] };
    }

    const result = this.pricingService.calculateCost(config, dto.usage || {}, {
      planId: dto.plan_id,
      planVersion,
    });

    return res.status(HttpStatus.OK).json({
      plan_id: dto.plan_id || null,
      plan_version: planVersion,
      total_amount_cents: result.totalAmountCents,
      line_items: result.lineItems,
    });
  }
}
