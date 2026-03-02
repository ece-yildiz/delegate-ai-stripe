import { NextResponse } from 'next/server';
import { POST as runPost } from '@/app/api/agent-runs/route';

export async function POST(req: Request) {
  try {
    const { agentId, prompt, boundary } = await req.json();

    if (!agentId || !prompt) {
      return NextResponse.json(
        { error: 'agentId and prompt are required' },
        { status: 400 },
      );
    }

    // ✅ Forward boundary to the real orchestrator
    const internalResponse = await runPost(
      new Request('http://internal/api/agent-runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId, prompt, boundary }),
      }),
    );

    const data = await internalResponse.json();

    if ('error' in data) {
      return NextResponse.json(
        { agentResponse: `Agent run failed: ${data.error}` },
        { status: 500 },
      );
    }

    return NextResponse.json({
      agentResponse: data.finalMessage,
      runId: data.runId,
      requestId: data.requestId,
      finalStatus: data.finalStatus,

      // Optional passthrough for UI clarity (safe even if undefined)
      denyReason: data.denyReason,
      stripePaymentIntentId: data.stripePaymentIntentId,
      stripeStatus: data.stripeStatus,
    });
  } catch (error: any) {
    console.error('SIMULATE ERROR:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}