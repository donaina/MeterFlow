import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  HttpStatus,
  Res,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
import { Response } from 'express';
import { PlansService } from './plans.service';
import { CreatePlanDto, UpdatePlanDto } from './dto/create-plan.dto';

@ApiTags('Plans')
@Controller('plans')
export class PlansController {
  constructor(private readonly plansService: PlansService) {}

  @Post()
  @ApiOperation({
    summary: 'Create a Config-Driven Pricing Plan',
    description: 'Creates a new pricing plan with version 1 JSONB pricing configuration.',
  })
  @ApiResponse({ status: 201, description: 'Plan created successfully' })
  async createPlan(@Body() dto: CreatePlanDto, @Res() res: Response) {
    const plan = await this.plansService.createPlan(dto);
    return res.status(HttpStatus.CREATED).json(plan);
  }

  @Get()
  @ApiOperation({ summary: 'List All Pricing Plans' })
  @ApiResponse({ status: 200, description: 'List of pricing plans' })
  async listPlans(@Res() res: Response) {
    const plans = await this.plansService.listPlans();
    return res.status(HttpStatus.OK).json(plans);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get Pricing Plan by ID' })
  @ApiParam({ name: 'id', description: 'Plan UUID' })
  @ApiResponse({ status: 200, description: 'Plan details' })
  @ApiResponse({ status: 404, description: 'Plan not found' })
  async getPlan(@Param('id') id: string, @Res() res: Response) {
    const plan = await this.plansService.findPlanById(id);
    return res.status(HttpStatus.OK).json(plan);
  }

  @Put(':id')
  @ApiOperation({
    summary: 'Update Plan Pricing Config (Zero-Redeploy)',
    description: 'Updates plan pricing config and increments the version counter automatically with zero code redeployment.',
  })
  @ApiParam({ name: 'id', description: 'Plan UUID' })
  @ApiResponse({ status: 200, description: 'Plan updated with incremented version' })
  @ApiResponse({ status: 404, description: 'Plan not found' })
  async updatePlan(
    @Param('id') id: string,
    @Body() dto: UpdatePlanDto,
    @Res() res: Response,
  ) {
    const updated = await this.plansService.updatePlan(id, dto);
    return res.status(HttpStatus.OK).json(updated);
  }
}
