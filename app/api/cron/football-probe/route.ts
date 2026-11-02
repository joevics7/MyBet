import { NextRequest, NextResponse } from 'next/server';
import { runProbe } from '@/lib/footballApi/jobs';

export const runtime = 'nodejs';
export const maxDuration = 60;

// One-off check of what the API-Football plan allows (4 requests, counted in the daily budget). Run the daily job first
// so there is a saved list to take a sample game from. Not for scheduling.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const ok = secret ? req.headers.get('authorization') === `Bearer ${secret}` : process.env.NODE_ENV !== 'production';
  if (!ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    return NextResponse.json(await runProbe());
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
