'use client';

import Link from 'next/link';
import { XCircle, ArrowRight } from 'lucide-react';

export default function CheckoutCancelPage() {
  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-50 p-8 font-sans flex items-center justify-center">
      <div className="max-w-md mx-auto text-center space-y-6">
        <XCircle className="w-16 h-16 text-amber-400 mx-auto" />
        <h1 className="text-2xl font-semibold">Payment cancelled</h1>
        <p className="text-neutral-400 text-sm">
          You left checkout. No charge was made.
        </p>
        <Link
          href="/checkout"
          className="inline-flex items-center gap-2 py-2 px-4 rounded-lg bg-neutral-700 hover:bg-neutral-600 text-sm"
        >
          Try again <ArrowRight className="w-4 h-4" />
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
