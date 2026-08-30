import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePlanDto, UpdatePlanDto } from './dto/create-plan.dto';
import { Prisma } from '@prisma/client';

@Injectable()
export class PlansService {
  private readonly logger = new Logger(PlansService.name);

  constructor(private readonly prisma: PrismaService) {}

  async createPlan(dto: CreatePlanDto) {
    const plan = await this.prisma.plan.create({
      data: {
        name: dto.name,
        pricingConfig: dto.pricing_config as unknown as Prisma.InputJsonValue,
        version: 1,
      },
    });

    this.logger.log(`Created plan "${plan.name}" (ID: ${plan.id}, version: ${plan.version})`);
    return plan;
  }

  async findPlanById(id: string) {
    const plan = await this.prisma.plan.findUnique({
      where: { id },
    });

    if (!plan) {
      throw new NotFoundException(`Plan with ID "${id}" not found`);
    }

    return plan;
  }

  async listPlans() {
    return this.prisma.plan.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  async updatePlan(id: string, dto: UpdatePlanDto) {
    const existing = await this.findPlanById(id);

    const updated = await this.prisma.plan.update({
      where: { id },
      data: {
        name: dto.name || existing.name,
        pricingConfig: dto.pricing_config
          ? (dto.pricing_config as unknown as Prisma.InputJsonValue)
          : (existing.pricingConfig as Prisma.InputJsonValue),
        version: {
          increment: 1,
        },
      },
    });

    this.logger.log(`Updated plan "${updated.name}" to version ${updated.version} (ID: ${updated.id})`);
    return updated;
  }
}
