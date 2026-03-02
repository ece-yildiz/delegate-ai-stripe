import { NextResponse } from 'next/server';
import { db } from '@/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  const requests = await db.query.spendRequests.findMany({
    orderBy: (req, { desc }) => [desc(req.createdAt)],
    limit: 200,
  });

  // Group by date (YYYY-MM-DD) and state
  const byDate = new Map<
    string,
    { authorized: number; captured: number; blocked: number; authNotCaptured: number }
  >();

  for (const req of requests) {
    const date = req.createdAt
      ? new Date(req.createdAt).toISOString().slice(0, 10)
      : 'unknown';

    if (!byDate.has(date)) {
      byDate.set(date, { authorized: 0, captured: 0, blocked: 0, authNotCaptured: 0 });
    }
    const entry = byDate.get(date)!;

    if (req.state === 'CAPTURED') {
      entry.captured += 1;
    } else if (req.state === 'DENIED') {
      entry.blocked += 1;
    } else if (req.state === 'APPROVED_AUTHORIZED') {
      entry.authorized += 1;
      entry.authNotCaptured += 1;
    }
  }

  // Sort by date ascending for chart rendering
  const sorted = Array.from(byDate.entries())
    .filter(([d]) => d !== 'unknown')
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, counts]) => ({ date, ...counts }));

  return NextResponse.json(sorted);
}
