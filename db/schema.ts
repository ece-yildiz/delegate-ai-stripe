import { pgTable, text, integer, timestamp, jsonb } from 'drizzle-orm/pg-core';
import { createId } from '@paralleldrive/cuid2';

export const agents = pgTable('agents', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  name: text('name').notNull(),
  stripeCustomerId: text('stripe_customer_id').notNull(), // Human's Stripe Customer
  stripePaymentMethodId: text('stripe_payment_method_id').notNull(), // Attached Card
  status: text('status').default('ACTIVE').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});

export const policies = pgTable('policies', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  agentId: text('agent_id').references(() => agents.id).notNull(),
  maxPerActionCents: integer('max_per_action_cents').notNull(),
  vendorAllowlist: jsonb('vendor_allowlist').$type<string[]>().notNull(),
});

export const spendRequests = pgTable('spend_requests', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  agentId: text('agent_id').references(() => agents.id).notNull(),
  vendor: text('vendor').notNull(),
  amountCents: integer('amount_cents').notNull(),
  memo: text('memo'),
  idempotencyKey: text('idempotency_key').unique().notNull(),
  state: text('state').notNull(), // APPROVED, DENIED, CAPTURED, FAILED
  denyReason: text('deny_reason'),
  stripeIntentId: text('stripe_intent_id'),
   projectId: text('project_id'),
   vendorId: text('vendor_id'),
   policyVersionId: text('policy_version_id'),
  createdAt: timestamp('created_at').defaultNow(),
});

export const agentRuns = pgTable('agent_runs', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  agentId: text('agent_id').references(() => agents.id).notNull(),
  userPrompt: text('user_prompt').notNull(),
  finalStatus: text('final_status'),
  finalMessage: text('final_message'),
  createdAt: timestamp('created_at').defaultNow(),
});

export const agentRunSteps = pgTable('agent_run_steps', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  runId: text('run_id').references(() => agentRuns.id).notNull(),
  idx: integer('idx').notNull(),
  type: text('type').notNull(), // e.g. POLICY, LEDGER, SPEND_AGENT, RISK_AGENT, EXPLAINER, STRIPE
  actor: text('actor'), // e.g. SpendAgent, RiskAgent, ExplainerAgent, System
  summary: text('summary').notNull(),
  input: jsonb('input'),
  output: jsonb('output'),
  createdAt: timestamp('created_at').defaultNow(),
});

export const agentMemories = pgTable('agent_memories', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  agentId: text('agent_id').references(() => agents.id).notNull(),
  kind: text('kind').notNull(), // PREFERENCE, RULE, EPISODE
  content: text('content').notNull(),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at').defaultNow(),
});

export const projects = pgTable('projects', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  name: text('name').notNull(),
  ownerAgentId: text('owner_agent_id').references(() => agents.id),
  status: text('status').default('ACTIVE').notNull(), // ACTIVE, PAUSED, CLOSED
  createdAt: timestamp('created_at').defaultNow(),
});

export const projectBudgets = pgTable('project_budgets', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  projectId: text('project_id').references(() => projects.id).notNull(),
  period: text('period').notNull(), // e.g. MONTHLY, QUARTERLY
  limitCents: integer('limit_cents').notNull(),
  spentCents: integer('spent_cents').default(0).notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});

export const agentProjectAssignments = pgTable('agent_project_assignments', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  agentId: text('agent_id').references(() => agents.id).notNull(),
  projectId: text('project_id').references(() => projects.id).notNull(),
  role: text('role').notNull(), // e.g. OWNER, CONTRIBUTOR, REVIEWER
  createdAt: timestamp('created_at').defaultNow(),
});

export const vendors = pgTable('vendors', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  slug: text('slug').notNull(), // e.g. kaggle_api
  displayName: text('display_name').notNull(),
  riskTier: text('risk_tier').default('LOW').notNull(), // LOW, MEDIUM, HIGH
  country: text('country'),
  category: text('category'),
  createdAt: timestamp('created_at').defaultNow(),
});

export const vendorRiskEvents = pgTable('vendor_risk_events', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  vendorId: text('vendor_id').references(() => vendors.id).notNull(),
  type: text('type').notNull(), // DISPUTE, CHARGEBACK, FRAUD_ALERT, OTHER
  details: text('details'),
  createdAt: timestamp('created_at').defaultNow(),
});

export const policySets = pgTable('policy_sets', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  name: text('name').notNull(),
  description: text('description'),
  createdAt: timestamp('created_at').defaultNow(),
});

export const policyVersions = pgTable('policy_versions', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  policySetId: text('policy_set_id')
    .references(() => policySets.id)
    .notNull(),
  version: integer('version').notNull(),
  config: jsonb('config').notNull(),
  isLive: integer('is_live').default(0).notNull(), // treated as boolean
  createdAt: timestamp('created_at').defaultNow(),
});

export const events = pgTable('events', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  type: text('type').notNull(), // e.g. AGENT_RUN_STARTED, SPEND_REQUEST_CREATED
  actorType: text('actor_type').notNull(), // USER, AGENT, SYSTEM
  actorId: text('actor_id'),
  payload: jsonb('payload'),
  createdAt: timestamp('created_at').defaultNow(),
});

export const evalScenarios = pgTable('eval_scenarios', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  name: text('name').notNull(),
  prompt: text('prompt').notNull(),
  expectedDecision: text('expected_decision').notNull(), // ALLOW or DENY
  tags: jsonb('tags'),
  createdAt: timestamp('created_at').defaultNow(),
});

export const evalRuns = pgTable('eval_runs', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  label: text('label'),
  commitHash: text('commit_hash'),
  createdAt: timestamp('created_at').defaultNow(),
});

export const evalResults = pgTable('eval_results', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  evalRunId: text('eval_run_id').references(() => evalRuns.id).notNull(),
  scenarioId: text('scenario_id').references(() => evalScenarios.id).notNull(),
  actualDecision: text('actual_decision').notNull(), // ALLOW or DENY
  passed: integer('passed').notNull(), // 1 or 0
  metrics: jsonb('metrics'),
  createdAt: timestamp('created_at').defaultNow(),
});