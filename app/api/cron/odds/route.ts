// OPERATING NOTES -- Odds Comparison refresh job
// - ONE URL, called 3 times a day by three cron-job.org jobs (same URL, three
//   times of day you choose):
//     GET https://<your-domain>/api/cron/odds
//     header  Authorization: Bearer <CRON_SECRET>      (set CRON_SECRET in Vercel)
// - Every call re-fetches everything (SportyBet, Football.com, Betway NG direct
//   feeds for the next 6 days; OddsPapi fallback for the first 2 days) and
//   REPLACES the stored snapshot (table odds_snapshots).
// - Visitors never trigger fetching: /api/odds/day only reads the stored
//   snapshot, so what they see stays the same until the next call of this job.
// - A build that finds no matches at all is discarded, keeping the last good snapshot.
// - cron-job.org drops a request after ~30s, so by default this replies 202
//   immediately and finishes in the background. Add ?wait=1 to run it in the
//   foreground and get the full report (use for manual testing).
import { NextRequest, NextResponse } from 'next/server';
import { waitUntil } from '@vercel/functions';
import { buildDay } from '@/lib/odds/day';
import { saveSnapshot } from '@/lib/odds/snapshot';

export const runtime = 'nodejs';
export const maxDuration = 60;

const WINDOW_DAYS = 6;

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  // Public URL called by a third-party scheduler: a secret is REQUIRED in production.
  if (!secret) return process.env.NODE_ENV !== 'production';
  return req.headers.get('authorization') === `Bearer ${secret}`;
}

async function refresh(): Promise<NextResponse> {
  const started = Date.now();
  const from = Date.now();
  const built = await buildDay(from, from + WINDOW_DAYS * 86400000, { deadlineMs: started + 50000 });
  const saved = await saveSnapshot(built);

  if (!saved.saved) {
    console.error('[odds cron] build found no matches; keeping the previous snapshot. Sources:', JSON.stringify(built.sources));
  }
  return NextResponse.json(
    {
      refreshedAt: new Date().toISOString(),
      saved: saved.saved,
      matches: saved.matches,
      daysWritten: saved.days,
      sources: built.sources,
      timingMs: Date.now() - started,
    },
    { status: saved.saved ? 200 : 502 },
  );
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (req.nextUrl.searchParams.get('wait') === '1') {
    try {
      return await refresh();
    } catch (err) {
      console.error('[odds cron] failed:', err);
      return NextResponse.json({ error: 'Refresh failed', message: err instanceof Error ? err.message : String(err) }, { status: 500 });
    }
  }

  waitUntil(
    refresh()
      .then((res) => console.log('[odds cron] finished, HTTP', res.status))
      .catch((err) => console.error('[odds cron] failed:', err)),
  );
  return NextResponse.json({ status: 'started', note: 'Refreshing in the background. Add ?wait=1 to run in the foreground and see the report.' }, { status: 202 });
}
