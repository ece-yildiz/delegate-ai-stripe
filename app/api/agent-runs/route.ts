import { NextResponse } from 'next/server';
import { createId } from '@paralleldrive/cuid2';
import { db } from '@/db';
import {
  agentRuns,
  agentRunSteps,
  agentMemories,
  policies,
  projects,
  projectBudgets,
  vendors,
  vendorRiskEvents,
  events,
  spendRequests,
  agents,
} from '@/db/schema';
import { desc, eq } from 'drizzle-orm';
import { POST as spendPost } from '@/app/api/agents/[agentId]/spend/route';
import { POST as capturePost } from '@/app/api/agents/[agentId]/capture/route';

export const dynamic = 'force-dynamic';

type StepType =
  | 'POLICY'
  | 'LEDGER'
  | 'MEMORY'
  | 'VENDOR_RISK'
  | 'BUDGET'
  | 'SPEND_AGENT'
  | 'RISK_AGENT'
  | 'EXPLAINER'
  | 'STRIPE';

type BoundaryInput = {
  limitCents?: number;
  vendorAllowlist?: string[];
  active?: boolean;
};

async function logStep(params: {
  runId: string;
  idx: number;
  type: StepType;
  actor: string;
  summary: string;
  input?: unknown;
  output?: unknown;
}) {
  const { runId, idx, type, actor, summary, input, output } = params;
  await db.insert(agentRunSteps).values({
    id: createId(),
    runId,
    idx,
    type,
    actor,
    summary,
    input,
    output,
  });
}

function safeJsonParse<T>(raw: unknown): T | null {
  if (typeof raw !== 'string') return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

type SpendProposal = {
  vendor: string;
  amountCents: number;
  memo: string;
  projectName?: string;
};

type RiskDecision = {
  decision: 'APPROVE' | 'DENY';
  rationale?: string;
  alternativeSuggestion?: string;
};

async function getContext(agentId: string) {
  const policy = await db.query.policies.findFirst({
    where: eq(policies.agentId, agentId),
  });

  const recent = await db.query.spendRequests.findMany({
    where: (req, { eq }) => eq(req.agentId, agentId),
    orderBy: (req, helpers) => [helpers.desc(req.createdAt)],
    limit: 5,
  });

  const memories = await db.query.agentMemories.findMany({
    where: (m, { eq }) => eq(m.agentId, agentId),
    orderBy: (m, helpers) => [helpers.desc(m.createdAt)],
    limit: 5,
  });

  const recentVendorSlugs = Array.from(new Set(recent.map((r) => r.vendor)));
  const knownVendors =
    recentVendorSlugs.length === 0
      ? []
      : await db.query.vendors.findMany({
          where: (v, { inArray: inArr }) => inArr(v.slug, recentVendorSlugs),
        });

  const vendorRisk =
    knownVendors.length === 0
      ? []
      : await db.query.vendorRiskEvents.findMany({
          where: (e, { inArray: inArr }) =>
            inArr(
              e.vendorId,
              knownVendors.map((v) => v.id),
            ),
          orderBy: (e, helpers) => [helpers.desc(e.createdAt)],
          limit: 10,
        });

  const projectsForAgent = await db.query.projects.findMany({
    where: (p, { eq }) => eq(p.ownerAgentId, agentId),
    orderBy: (p, helpers) => [helpers.desc(p.createdAt)],
    limit: 5,
  });

  const budgets =
    projectsForAgent.length === 0
      ? []
      : await db.query.projectBudgets.findMany({
          where: (b, { inArray: inArr }) =>
            inArr(
              b.projectId,
              projectsForAgent.map((p) => p.id),
            ),
        });

  return {
    policy,
    recent,
    memories,
    knownVendors,
    vendorRisk,
    projectsForAgent,
    budgets,
  };
}

async function emitEvent(payload: {
  type: string;
  actorType: string;
  actorId?: string;
  payload?: unknown;
}) {
  const { type, actorType, actorId, payload: body } = payload;
  await db.insert(events).values({
    id: createId(),
    type,
    actorType,
    actorId,
    payload: body ?? null,
  });
}

export async function POST(req: Request) {
  try {
    const { agentId, prompt, boundary } = (await req.json()) as {
      agentId?: string;
      prompt?: string;
      boundary?: BoundaryInput;
    };

    if (!agentId || !prompt) {
      return NextResponse.json(
        { error: 'agentId and prompt are required' },
        { status: 400 },
      );
    }

    await emitEvent({
      type: 'AGENT_RUN_STARTED',
      actorType: 'AGENT',
      actorId: agentId,
      payload: { prompt, boundary },
    });

    const [run] = await db
      .insert(agentRuns)
      .values({
        agentId,
        userPrompt: prompt,
      })
      .returning();

    let idx = 0;

    const ctx = await getContext(agentId);
    const {
      policy,
      recent,
      memories,
      knownVendors,
      vendorRisk,
      projectsForAgent,
      budgets,
    } = ctx;

    await logStep({
      runId: run.id,
      idx: idx++,
      type: 'POLICY',
      actor: 'System',
      summary: policy
        ? 'Loaded policy for agent.'
        : 'No policy configured for this agent.',
      input: { agentId },
      output: policy,
    });

    await logStep({
      runId: run.id,
      idx: idx++,
      type: 'LEDGER',
      actor: 'System',
      summary: 'Loaded recent spend requests for agent.',
      input: { agentId },
      output: recent,
    });

    if (memories.length > 0) {
      await logStep({
        runId: run.id,
        idx: idx++,
        type: 'MEMORY',
        actor: 'System',
        summary: 'Loaded recent agent memories.',
        input: { agentId },
        output: memories,
      });
    }

    if (knownVendors.length > 0 || vendorRisk.length > 0) {
      await logStep({
        runId: run.id,
        idx: idx++,
        type: 'VENDOR_RISK',
        actor: 'System',
        summary: 'Loaded vendor profiles and risk events.',
        input: {},
        output: { knownVendors, vendorRisk },
      });
    }

    if (projectsForAgent.length > 0 || budgets.length > 0) {
      await logStep({
        runId: run.id,
        idx: idx++,
        type: 'BUDGET',
        actor: 'System',
        summary: 'Loaded projects and budgets for this agent.',
        input: {},
        output: { projectsForAgent, budgets },
      });
    }

    // Step 1: SpendAgent proposes a spend
    const openAiResponse = await fetch(
      'https://api.openai.com/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: 'gpt-4o',
          messages: [
            {
              role: 'system',
              content:
                'You are SpendAgent, a delegated spend planner. Your job is to propose a single concrete spend request (vendor, amount in cents, memo, optional project name) based on the user request and the provided context. Do not make a final policy decision.',
            },
            { role: 'system', content: 'Policy: ' + JSON.stringify(policy ?? null) },
            { role: 'system', content: 'RecentLedger: ' + JSON.stringify(recent) },
            { role: 'system', content: 'Memories: ' + JSON.stringify(memories) },
            { role: 'system', content: 'VendorProfiles: ' + JSON.stringify(knownVendors) },
            { role: 'system', content: 'VendorRiskEvents: ' + JSON.stringify(vendorRisk) },
            { role: 'system', content: 'Projects: ' + JSON.stringify(projectsForAgent) },
            { role: 'system', content: 'Budgets: ' + JSON.stringify(budgets) },
            {
              role: 'user',
              content:
                'User request: ' + prompt + '\n\n' +
                'Propose a spend in pure JSON only, no markdown, matching this TypeScript type:\n' +
                '{ "vendor": string, "amountCents": number, "memo": string, "projectName"?: string }',
            },
          ],
        }),
      },
    );

    const openAiData = await openAiResponse.json();
    const content: string | undefined =
      openAiData.choices?.[0]?.message?.content;

    const proposal = safeJsonParse<SpendProposal>(content ?? '');

    await logStep({
      runId: run.id,
      idx: idx++,
      type: 'SPEND_AGENT',
      actor: 'SpendAgent',
      summary: proposal
        ? 'SpendAgent proposed a spend.'
        : 'SpendAgent response could not be parsed; treating as no-op.',
      input: { prompt, policy, recent },
      output: proposal ?? content,
    });

    let finalStatus = 'DENIED';
    let finalMessage =
      'Failed to understand the model response. No funds were authorized.';
    let requestId: string | null = null;
    let denyReason: string | null = null;
    let stripePaymentIntentId: string | null = null;
    let stripeStatus: string | null = null;

    if (proposal) {
      const riskResponse = await fetch(
        'https://api.openai.com/v1/chat/completions',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          },
          body: JSON.stringify({
            model: 'gpt-4o',
            messages: [
              {
                role: 'system',
                content:
                  'You are RiskAgent, a balanced risk and compliance reviewer. Your job is to decide whether to APPROVE or DENY a proposed spend.\n\n' +
                  'IMPORTANT GUIDELINES:\n' +
                  '- APPROVE the spend if the vendor is in the policy allowlist AND the amount is within the per-action limit.\n' +
                  '- APPROVE the spend if the vendor matches a wildcard ("*") allowlist.\n' +
                  '- Only DENY if there is a clear, concrete policy violation such as: amount exceeds the per-action limit, vendor is NOT in the allowlist, or there are recent high-severity risk events (FRAUD_ALERT, CHARGEBACK) for this specific vendor.\n' +
                  '- Do NOT deny based on vague concerns, hypothetical risks, or general caution.\n' +
                  '- You MUST always provide a "rationale" field explaining your reasoning, whether you APPROVE or DENY.\n' +
                  '- If you deny, optionally suggest a safer alternative.',
              },
              { role: 'system', content: 'Policy: ' + JSON.stringify(policy ?? null) },
              { role: 'system', content: 'RecentLedger: ' + JSON.stringify(recent) },
              { role: 'system', content: 'Memories: ' + JSON.stringify(memories) },
              { role: 'system', content: 'VendorProfiles: ' + JSON.stringify(knownVendors) },
              { role: 'system', content: 'VendorRiskEvents: ' + JSON.stringify(vendorRisk) },
              { role: 'system', content: 'Projects: ' + JSON.stringify(projectsForAgent) },
              { role: 'system', content: 'Budgets: ' + JSON.stringify(budgets) },
              {
                role: 'user',
                content:
                  'User request: ' + prompt + '\n\n' +
                  'ProposedSpend: ' + JSON.stringify(proposal) + '\n\n' +
                  'Respond in pure JSON only, no markdown, matching this TypeScript type:\n' +
                  '{ "decision": "APPROVE" | "DENY", "rationale"?: string, "alternativeSuggestion"?: string }',
              },
            ],
          }),
        },
      );

      const riskData = await riskResponse.json();
      const riskContent: string | undefined =
        riskData.choices?.[0]?.message?.content;
      const riskDecision = safeJsonParse<RiskDecision>(riskContent ?? '');

      await logStep({
        runId: run.id,
        idx: idx++,
        type: 'RISK_AGENT',
        actor: 'RiskAgent',
        summary: riskDecision
          ? 'RiskAgent decided to ' + riskDecision.decision + '. Rationale: ' + (riskDecision.rationale ?? 'none provided')
          : 'RiskAgent response could not be parsed; treating as DENY.',
        input: { proposal },
        output: riskDecision ?? riskContent,
      });

      if (riskDecision && riskDecision.decision === 'APPROVE') {
        const idempotencyKey = createId();

        const spendResponse = await spendPost(
          new Request('http://internal/api/agents/spend', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              vendor: proposal.vendor,
              amountCents: proposal.amountCents,
              memo: proposal.memo,
              idempotencyKey,
              boundary,
            }),
          }),
          { params: Promise.resolve({ agentId }) },
        );

        const backendData = await spendResponse.json();

        await logStep({
          runId: run.id,
          idx: idx++,
          type: 'STRIPE',
          actor: 'System',
          summary: 'Policy engine + Stripe responded with status ' + backendData.status + '.',
          input: {
            vendor: proposal.vendor,
            amountCents: proposal.amountCents,
            memo: proposal.memo,
            boundary,
          },
          output: backendData,
        });

        finalStatus = backendData.status ?? 'DENIED';
        requestId = backendData.requestId ?? null;
        denyReason = backendData.reason ?? null;
        stripePaymentIntentId = backendData.stripePaymentIntentId ?? null;
        stripeStatus = backendData.stripeStatus ?? null;

        // ✅ FIX 1: Auto-capture after successful authorization
        // This ensures the Stripe dashboard shows completed charges, not just uncaptured auths
        if (backendData.status === 'AUTHORIZED' && backendData.requestId) {
          try {
            const captureRes = await capturePost(
              new Request('http://internal/api/agents/capture', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ requestId: backendData.requestId }),
              }),
              { params: Promise.resolve({ agentId }) },
            );
            const captureData = await captureRes.json();

            if (captureData.status === 'CAPTURED') {
              finalStatus = 'CAPTURED';
              stripeStatus = 'succeeded';
              const amt = (proposal.amountCents / 100).toFixed(2);
              finalMessage = 'Captured $' + amt + ' for vendor ' + proposal.vendor +
                '. Stripe PaymentIntent: ' + backendData.stripePaymentIntentId;

              await logStep({
                runId: run.id,
                idx: idx++,
                type: 'STRIPE',
                actor: 'System',
                summary: 'Auto-captured PaymentIntent ' + backendData.stripePaymentIntentId + '.',
                input: { requestId: backendData.requestId },
                output: captureData,
              });
            } else {
              const amt = (proposal.amountCents / 100).toFixed(2);
              finalMessage = 'Authorized $' + amt + ' for vendor ' + proposal.vendor +
                '. Auto-capture pending — use manual capture. Request ID: ' + backendData.requestId;
            }
          } catch (captureErr: any) {
            console.error('Auto-capture failed:', captureErr?.message);
            const amt = (proposal.amountCents / 100).toFixed(2);
            finalMessage = 'Authorized $' + amt + ' for vendor ' + proposal.vendor +
              '. Auto-capture failed — use manual capture. Request ID: ' + backendData.requestId;
          }
        } else if (backendData.status !== 'AUTHORIZED') {
          finalMessage = 'Spend denied by policy engine. Reason: ' +
            (backendData.reason ?? 'Unknown error');
        }
      } else {
        // RiskAgent denied — persist with rationale into spend_requests for the Live Ledger
        finalStatus = 'DENIED';
        denyReason =
          riskDecision?.rationale ??
          'The risk agent decided this spend should be denied based on policy.';
        finalMessage = denyReason;

        const idempotencyKeyDeny = createId();
        const riskReason = 'RiskAgent: ' + denyReason +
          (riskDecision?.alternativeSuggestion
            ? ' | Suggestion: ' + riskDecision.alternativeSuggestion
            : '');

        const [deniedRequest] = await db
          .insert(spendRequests)
          .values({
            agentId,
            vendor: proposal.vendor,
            amountCents: proposal.amountCents,
            memo: proposal.memo,
            idempotencyKey: idempotencyKeyDeny,
            state: 'DENIED',
            denyReason: riskReason,
          })
          .returning();

        requestId = deniedRequest.id;
      }
    } else {
      finalStatus = 'DENIED';
      denyReason =
        'SpendAgent could not produce a valid proposal; no funds were authorized.';
      finalMessage = denyReason;
    }

    // Explainer
    const explainerResponse = await fetch(
      'https://api.openai.com/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            {
              role: 'system',
              content:
                'You are ExplainerAgent, writing a short explanation for a finance or product stakeholder about what the agent just did and why.',
            },
            {
              role: 'user',
              content: JSON.stringify({
                prompt,
                finalStatus,
                finalMessage,
                proposal,
                policy,
                recent,
                memories,
                boundary,
              }),
            },
          ],
        }),
      },
    );

    const explainerData = await explainerResponse.json();
    const explainerContent: string | undefined =
      explainerData.choices?.[0]?.message?.content;

    await logStep({
      runId: run.id,
      idx: idx++,
      type: 'EXPLAINER',
      actor: 'ExplainerAgent',
      summary: 'ExplainerAgent produced a narrative for humans.',
      input: { finalStatus },
      output: explainerContent,
    });

    if (explainerContent && typeof explainerContent === 'string') {
      finalMessage = explainerContent;
    }

    await db
      .update(agentRuns)
      .set({
        finalStatus,
        finalMessage,
      })
      .where(eq(agentRuns.id, run.id));

    await emitEvent({
      type: 'AGENT_RUN_COMPLETED',
      actorType: 'AGENT',
      actorId: agentId,
      payload: { runId: run.id, finalStatus, requestId, denyReason },
    });

    return NextResponse.json({
      runId: run.id,
      finalStatus,
      finalMessage,
      requestId,
      denyReason,
      stripePaymentIntentId,
      stripeStatus,
    });
  } catch (error: any) {
    console.error('AGENT_RUN_ERROR:', error);
    return NextResponse.json(
      { error: error.message ?? 'Unknown error running agent.' },
      { status: 500 },
    );
  }
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');

  if (!id) {
    const latest = await db
      .select()
      .from(agentRuns)
      .orderBy(desc(agentRuns.createdAt))
      .limit(1);

    if (!latest[0]) {
      return NextResponse.json(
        { error: 'No agent runs found.' },
        { status: 404 },
      );
    }

    const steps = await db.query.agentRunSteps.findMany({
      where: (step, { eq }) => eq(step.runId, latest[0].id),
      orderBy: (step, { asc }) => [asc(step.idx)],
    });

    return NextResponse.json({ run: latest[0], steps });
  }

  const runs = await db
    .select()
    .from(agentRuns)
    .where(eq(agentRuns.id, id))
    .limit(1);

  if (!runs[0]) {
    return NextResponse.json({ error: 'Run not found.' }, { status: 404 });
  }

  const steps = await db.query.agentRunSteps.findMany({
    where: (step, { eq }) => eq(step.runId, runs[0].id),
    orderBy: (step, { asc }) => [asc(step.idx)],
  });

  return NextResponse.json({ run: runs[0], steps });
}
