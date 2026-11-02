import { NextRequest, NextResponse } from 'next/server';
import { waitUntil } from '@vercel/functions';
import { runDailyJob } from '@/lib/footballApi/jobs';

export const runtime = 'nodejs';
export const maxDuration = 60;

// OPERATING NOTES -- Daily job: the day's list (1 request) + fills missing past days of results history (1 request each, 12 a
// run by default; ?days=34 fills it all at once). Run ONCE a day, early (e.g. 06:00 UTC).
// - Trigger: cron-job.org, GET https://<your-domain>/api/cron/football-daily, header Authorization: Bearer <CRON_SECRET>.
// - This and the other football job are the ONLY things that call API-Football. Total budget 86 requests a day, hard cap 88
//   (counted in the football_api_usage table). Needs the migration 20261101000000_football_api_store.sql.
// - Replies 202 straight away and finishes in the background (cron-job.org gives up after ~30s). Add ?wait=1 to run in
//   the foreground and see the report.
function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV !== 'production';
  return req.headers.get('authorization') === `Bearer ${secret}`;
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const asked = Number(req.nextUrl.searchParams.get('days'));
  const days = Number.isFinite(asked) && asked > 0 ? Math.min(Math.floor(asked), 35) : undefined;
  if (req.nextUrl.searchParams.get('wait') === '1') {
    try {
      return NextResponse.json(await runDailyJob(days));
    } catch (err) {
      console.error('[football-daily] failed:', err);
      return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
    }
  }
  waitUntil(runDailyJob(days).then((r) => console.log('[football-daily] done', JSON.stringify(r))).catch((e) => console.error('[football-daily] failed:', e)));
  return NextResponse.json({ status: 'started', note: 'Running in the background. Add ?wait=1 to see the report.' }, { status: 202 });
}
