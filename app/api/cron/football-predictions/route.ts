import { NextRequest, NextResponse } from 'next/server';
import { waitUntil } from '@vercel/functions';
import { runPredictionsJob } from '@/lib/footballApi/jobs';

export const runtime = 'nodejs';
export const maxDuration = 60;

// OPERATING NOTES -- Fills API-Football's own prediction for today's best 40 games, 7 per run (the free plan allows about
// 10 requests a minute). Trigger it from cron-job.org every 5 minutes for about an hour after the daily job
// (e.g. 06:10 to 07:10 UTC): 6 runs cover all 40. Runs with nothing queued cost nothing.
// Same auth and ?wait=1 behaviour as the other football crons.
function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV !== 'production';
  return req.headers.get('authorization') === `Bearer ${secret}`;
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (req.nextUrl.searchParams.get('wait') === '1') {
    try {
      return NextResponse.json(await runPredictionsJob());
    } catch (err) {
      console.error('[football-predictions] failed:', err);
      return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
    }
  }
  waitUntil(runPredictionsJob().then((r) => console.log('[football-predictions] done', JSON.stringify(r))).catch((e) => console.error('[football-predictions] failed:', e)));
  return NextResponse.json({ status: 'started', note: 'Running in the background. Add ?wait=1 to see the report.' }, { status: 202 });
}
