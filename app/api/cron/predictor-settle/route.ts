import { NextRequest, NextResponse } from 'next/server';
import { settleGames } from '@/lib/predictor/games';

export const runtime = 'nodejs';
export const maxDuration = 60;

// Marks the day's predictions won/lost by matching them to the SAVED scores. No API request, so it can run as often as
// you like (hourly from cron-job.org is fine). The score job also calls this after each run.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const ok = secret ? req.headers.get('authorization') === `Bearer ${secret}` : process.env.NODE_ENV !== 'production';
  if (!ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    return NextResponse.json({ ok: true, ...(await settleGames()) });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
