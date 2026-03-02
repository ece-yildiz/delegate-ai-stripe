import './load-env';
import { eq } from 'drizzle-orm';
import { db } from '../db';
import { agents, policies } from '../db/schema';

async function main() {
  const agentId = 'agent_123';

  const stripeCustomerId = process.env.DELEGATE_STRIPE_CUSTOMER_ID;
  const stripePaymentMethodId = process.env.DELEGATE_STRIPE_PAYMENT_METHOD_ID;

  if (!stripeCustomerId || !stripePaymentMethodId) {
    throw new Error(
      'DELEGATE_STRIPE_CUSTOMER_ID and DELEGATE_STRIPE_PAYMENT_METHOD_ID must be set in your environment.',
    );
  }

  const existingAgent = await db.query.agents.findFirst({
    where: eq(agents.id, agentId),
  });

  if (!existingAgent) {
    await db.insert(agents).values({
      id: agentId,
      name: 'ResearchBot',
      stripeCustomerId,
      stripePaymentMethodId,
      status: 'ACTIVE',
    });
    console.log(`Created agent ${agentId}.`);
  } else {
    console.log(`Agent ${agentId} already exists.`);
  }

  const existingPolicy = await db.query.policies.findFirst({
    where: eq(policies.agentId, agentId),
  });

  if (!existingPolicy) {
    await db.insert(policies).values({
      agentId,
      maxPerActionCents: 5000, // $50.00
      vendorAllowlist: ['kaggle_api', 'openai', 'sephora'],
    });
    console.log('Created default policy for agent_123.');
  } else {
    console.log('Policy for agent_123 already exists.');
  }

  console.log('Seed completed.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

