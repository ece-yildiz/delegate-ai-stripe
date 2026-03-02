'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { CheckCircle2, ArrowRight } from 'lucide-react';

function SuccessContent() {
  const searchParams = useSearchParams();
  const sessionId = searchParams.get('session_id');

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-50 p-8 font-sans flex items-center justify-center">
      <div className="max-w-md mx-auto text-center space-y-6">
        <CheckCircle2 className="w-16 h-16 text-emerald-400 mx-auto" />
        <h1 className="text-2xl font-semibold">Payment successful</h1>
        <p className="text-neutral-400 text-sm">
          Thank you. This was a test payment (test mode).
        </p>
        {sessionId && (
          <p className="text-xs text-neutral-500 font-mono break-all">
            Session: {sessionId}
          </p>
        )}
        <Link
          href="/checkout"
          className="inline-flex items-center gap-2 py-2 px-4 rounded-lg bg-neutral-700 hover:bg-neutral-600 text-sm"
        >
          Buy again <ArrowRight className="w-4 h-4" />
        </Link>
        <Link
          href="/"
          className="block text-sm text-neutral-500 hover:text-neutral-300"
        >
          Back to Delegate.ai
        </Link>
      </div>
    </div>
  );
}

export default function CheckoutSuccessPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-neutral-950 flex items-center justify-center text-neutral-500">Loading…</div>}>
      <SuccessContent />
    </Suspense>
  );
}
