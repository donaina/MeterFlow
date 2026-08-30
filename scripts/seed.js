const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const plan = await prisma.plan.upsert({
    where: { id: 'plan_pro_graduated' },
    update: {},
    create: {
      id: 'plan_pro_graduated',
      name: 'Pro Tiered Graduated Plan',
      pricingConfig: {
        flat_fee: { amount_cents: 3000, description: 'Base Pro Subscription' },
        rules: [
          {
            feature_key: 'api_calls',
            type: 'tiered_graduated',
            config: {
              description: 'Graduated API Invocations',
              tiers: [
                { from: 0, to: 1000, rate_cents: 0 },
                { from: 1000, to: 5000, rate_cents: 5 },
                { from: 5000, to: null, rate_cents: 2 }
              ]
            }
          },
          {
            feature_key: 'storage_gb',
            type: 'per_unit',
            config: {
              description: 'Persistent Storage Volume',
              rate_cents: 10,
              free_allowance: 20
            }
          }
        ]
      },
      version: 1
    }
  });

  const customer = await prisma.customer.upsert({
    where: { id: 'cust_acme_corp' },
    update: {},
    create: {
      id: 'cust_acme_corp',
      name: 'Acme Mega Corp',
      email: 'billing@acme.corp'
    }
  });

  await prisma.subscription.upsert({
    where: { id: 'sub_acme_pro' },
    update: {},
    create: {
      id: 'sub_acme_pro',
      customerId: customer.id,
      planId: plan.id,
      status: 'ACTIVE',
      startDate: new Date('2026-08-01T00:00:00.000Z')
    }
  });

  console.log('Seeded plan and customer successfully!');
}

main().catch(console.error).finally(() => prisma.$disconnect());
