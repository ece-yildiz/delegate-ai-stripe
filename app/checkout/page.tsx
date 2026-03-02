'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ShoppingCart, Loader2, ArrowLeft } from 'lucide-react';

export default function CheckoutPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCheckout = async (amountCents: number, label: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amountCents,
          productName: label,
          quantity: 1,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Checkout failed');
      if (data.url) window.location.href = data.url;
      else throw new Error('No checkout URL returned');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-50 p-8 font-sans">
      <div className="max-w-lg mx-auto space-y-8">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm text-neutral-400 hover:text-neutral-200"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Delegate.ai
        </Link>

        <div className="flex items-center gap-3">
          <ShoppingCart className="w-8 h-8 text-emerald-400" />
          <h1 className="text-2xl font-semibold">Stripe Checkout MVP</h1>
        </div>

        <p className="text-neutral-400 text-sm">
          Click a button to start a test payment. You’ll be redirected to Stripe
          Checkout, then back here on success or cancel.
        </p>

        {error && (
          <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
            {error}
          </div>
        )}

        <div className="grid gap-3">
          <button
            onClick={() => handleCheckout(1000, 'Demo — $10.00')}
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium disabled:opacity-50"
          >
            {loading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <>Pay $10.00 — Demo</>
            )}
          </button>
          <button
            onClick={() => handleCheckout(500, 'Demo — $5.00')}
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-lg bg-neutral-700 hover:bg-neutral-600 text-white font-medium disabled:opacity-50"
          >
            {loading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <>Pay $5.00 — Demo</>
            )}
          </button>
          <button
            onClick={() => handleCheckout(299, 'Demo — $2.99')}
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-lg bg-neutral-700 hover:bg-neutral-600 text-white font-medium disabled:opacity-50"
          >
            {loading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <>Pay $2.99 — Demo</>
            )}
          </button>
        </div>

        <p className="text-xs text-neutral-500">
          Use Stripe test card: 4242 4242 4242 4242. Any future expiry, any CVC.
        </p>
      </div>
    </div>
  );
}
