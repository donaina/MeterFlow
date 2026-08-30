export interface TierDefinition {
  from: number;          // e.g. 0
  to: number | null;     // e.g. 1000, or null for open-ended last tier
  rate_cents: number;    // e.g. 0 for free allowance, 5 for 5¢/unit
}

export interface FlatFeeConfig {
  amount_cents: number;  // e.g. 2900 ($29.00)
  description?: string;
}

export interface PerUnitConfig {
  rate_cents: number;    // e.g. 2 (2¢/unit)
  free_allowance?: number; // e.g. 100 free units
  description?: string;
}

export interface TieredGraduatedConfig {
  tiers: TierDefinition[];
  description?: string;
}

export interface VolumeConfig {
  tiers: TierDefinition[];
  description?: string;
}

export type PricingRuleConfig = FlatFeeConfig | PerUnitConfig | TieredGraduatedConfig | VolumeConfig;

export interface PricingRule {
  feature_key?: string; // Optional: omitted for base plan flat fee
  type: 'flat_fee' | 'per_unit' | 'tiered_graduated' | 'volume';
  config: PricingRuleConfig;
}

export interface PlanPricingConfig {
  flat_fee?: FlatFeeConfig;
  rules: PricingRule[];
}

export interface TierCalculationItem {
  tierIndex: number;
  from: number;
  to: number | null;
  unitsInTier: number;
  rateCents: number;
  subtotalCents: number;
}

export interface LineItemBreakdown {
  featureKey?: string;
  description: string;
  quantity: number;
  amountCents: number;
  details?: {
    rateCents?: number;
    freeAllowance?: number;
    billableUnits?: number;
    tiers?: TierCalculationItem[];
  };
}

export interface PlanCostCalculationResult {
  planId?: string;
  planVersion?: number;
  totalAmountCents: number;
  lineItems: LineItemBreakdown[];
}

export interface PricingStrategy {
  readonly type: string;
  calculate(quantity: number, config: any, featureKey?: string): LineItemBreakdown;
}
