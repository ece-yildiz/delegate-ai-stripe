import { NextResponse } from 'next/server';
import { db } from '@/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  // ✅ FIX 2: Return more records, newest first (desc by createdAt)
  const requests = await db.query.spendRequests.findMany({
    orderBy: (req, { desc }) => [desc(req.createdAt)],
    limit: 50,
  });
  return NextResponse.json(requests);
}