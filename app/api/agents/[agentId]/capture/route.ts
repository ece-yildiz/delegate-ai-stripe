import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { db } from '@/db';
import { spendRequests } from '@/db/schema';
import { eq } from 'drizzle-orm';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2026-02-25.clover',
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ agentId: string }> },
) {
  const { agentId } = await params;
  const { requestId } = await req.json();

  const request = await db.query.spendRequests.findFirst({
    where: eq(spendRequests.id, requestId),
  });

  if (!request || !request.stripeIntentId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  if (request.agentId !== agentId) {
    return NextResponse.json(
      { error: 'Request does not belong to this agent' },
      { status: 403 },
    );
  }

  if (request.state === 'CAPTURED') {
    return NextResponse.json({
      status: 'CAPTURED',
      intentId: request.stripeIntentId,
    });
  }

  if (request.state !== 'APPROVED_AUTHORIZED') {
    return NextResponse.json(
      { error: 'Request is not in a capturable state' },
      { status: 400 },
    );
  }

  const intent = await stripe.paymentIntents.capture(request.stripeIntentId);

  await db
    .update(spendRequests)
    .set({ state: 'CAPTURED' })
    .where(eq(spendRequests.id, requestId));

  return NextResponse.json({ status: 'CAPTURED', intentId: intent.id });
}