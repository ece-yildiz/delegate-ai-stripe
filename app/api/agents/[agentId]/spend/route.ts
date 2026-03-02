// app/api/agents/[agentId]/spend/route.ts
import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { db } from '@/db';
import { agents, policies, spendRequests } from '@/db/schema';
import { eq } from 'drizzle-orm';

type BoundaryInput = {
  limitCents?: number;
  vendorAllowlist?: string[];
  active?: boolean;
};

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2026-02-25.clover',
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ agentId: string }> },
) {
  const { agentId } = await params;

  const {
    vendor,
    amountCents,
    memo,
    idempotencyKey,
    boundary,
  }: {
    vendor: string;
    amountCents: number;
    memo?: string;
    idempotencyKey: string;
    boundary?: BoundaryInput;
  } = await req.json();

  // 1) Idempotency
  const existing = await db.query.spendRequests.findFirst({
    where: (r, { eq }) => eq(r.idempotencyKey, idempotencyKey),
  });

  if (existing) {
    const status =
      existing.state === 'APPROVED_AUTHORIZED' ? 'AUTHORIZED' : existing.state;
    return NextResponse.json({
      status,
      requestId: existing.id,
      reason: existing.denyReason ?? undefined,
      stripePaymentIntentId: existing.stripeIntentId ?? undefined,
    });
  }

  // 2) Fetch Agent + DB policy (DB policy remains default source of truth)
  const agent = await db.query.agents.findFirst({
    where: eq(agents.id, agentId),
  });
  const policy = await db.query.policies.findFirst({
    where: eq(policies.agentId, agentId),
  });

  if (!agent || agent.status !== 'ACTIVE' || !policy) {
    return deny(
      agentId,
      vendor,
      amountCents,
      idempotencyKey,
      'Agent inactive or missing policy',
    );
  }

  // 3) Effective boundary (UI boundary overrides DB policy for this demo)
  const boundaryActive = boundary?.active ?? true;

  const effectiveLimit = Number(
    boundary?.limitCents ?? policy.maxPerActionCents,
  );

  const allowlist =
    boundary?.vendorAllowlist && boundary.vendorAllowlist.length > 0
      ? boundary.vendorAllowlist
      : policy.vendorAllowlist;

  const normalizedAllowlist = allowlist.map((v) =>
    String(v).toLowerCase().trim(),
  );
  const normalizedVendor = String(vendor).toLowerCase().trim();

  // 4) Enforce boundary (NO per-tx approvals)
  if (!boundaryActive) {
    return deny(
      agentId,
      vendor,
      amountCents,
      idempotencyKey,
      'Delegation revoked',
    );
  }

  if (amountCents > effectiveLimit) {
    return deny(
      agentId,
      vendor,
      amountCents,
      idempotencyKey,
      `Amount exceeds limit of ${effectiveLimit} cents`,
    );
  }

  if (
    !normalizedAllowlist.includes('*') &&
    !normalizedAllowlist.includes(normalizedVendor)
  ) {
    return deny(
      agentId,
      vendor,
      amountCents,
      idempotencyKey,
      `Vendor ${vendor} is not in allowlist`,
    );
  }

  // 5) Stripe authorize (manual capture)
  try {
    const paymentIntent = await stripe.paymentIntents.create(
      {
        amount: amountCents,
        currency: 'usd',
        customer: agent.stripeCustomerId,
        payment_method: agent.stripePaymentMethodId,
        confirm: true,
        capture_method: 'manual',

        // ✅ FIX: prevent Stripe from requiring redirect-capable methods / return_url
        automatic_payment_methods: {
          enabled: true,
          allow_redirects: 'never',
        },

        // ✅ recommended for saved card + no user present
        off_session: true,

        // ✅ FIX 4: return_url required by Stripe at PaymentIntent confirmation
        // even with allow_redirects: 'never', some Stripe API versions still require it
        return_url: (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000') + '/api/agents/' + agentId + '/spend',

        // ✅ keep metadata Stripe-aligned + link to request via idempotencyKey
        metadata: {
          agent_id: agentId,
          vendor,
          memo: memo ?? '',
          idempotency_key: idempotencyKey,
          boundary_limit_cents: String(effectiveLimit),
        },
      },
      { idempotencyKey },
    );

    const [request] = await db
      .insert(spendRequests)
      .values({
        agentId,
        vendor,
        amountCents,
        memo: memo ?? null,
        idempotencyKey,
        state: 'APPROVED_AUTHORIZED',
        stripeIntentId: paymentIntent.id,
      })
      .returning();

    return NextResponse.json({
      status: 'AUTHORIZED',
      requestId: request.id,
      stripePaymentIntentId: paymentIntent.id,
      stripeStatus: paymentIntent.status, // often "requires_capture"
    });
  } catch (error: any) {
    return deny(
      agentId,
      vendor,
      amountCents,
      idempotencyKey,
      `Stripe Error: ${error?.message ?? String(error)}`,
    );
  }
}

async function deny(
  agentId: string,
  vendor: string,
  amount: number,
  idemp: string,
  reason: string,
) {
  const [request] = await db
    .insert(spendRequests)
    .values({
      agentId,
      vendor,
      amountCents: amount,
      idempotencyKey: idemp,
      state: 'DENIED',
      denyReason: reason,
    })
    .returning();

  return NextResponse.json(
    { status: 'DENIED', reason, requestId: request.id },
    { status: 403 },
  );
}