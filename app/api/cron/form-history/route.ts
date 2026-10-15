import { NextRequest, NextResponse } from 'next/server';
import { ensureHistory } from '@/lib/services/formHistory';
import { fetchFinishedDay, isApiFootballConfigured } from '@/lib/services/apiFootball';

export const runtime = 'nodejs';
export const maxDuration = 60;

// OPERATING NOTES -- Form history (feeds the Predictor and the Decoder's confidence score)
// - Fills the football_results_by_day table: one API-Football request per PAST day (all leagues), stored once.
//   Team form is then built from it with no API requests. Needs API_FOOTBALL_KEY and the migration
//   20261015000000_football_results_by_day.sql.
// - First setup: call this URL a few times, at least a minute apart (default 8 days per call, to stay under the
//   per-minute limit). It needs ~35 days: about 5 calls. After that it only fetches yesterday (1 request).
// - Trigger: cron-job.org, GET https://<your-domain>/api/cron/form-history, header Authorization: Bearer <CRON_SECRET>.
//   Daily is enough once filled. ?days=N changes how many days one call may fetch (max 10).
function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV !== 'production';
  return req.headers.get('authorization') === `Bearer ${secret}`;
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isApiFootballConfigured()) return NextResponse.json({ error: 'API_FOOTBALL_KEY is not set.' }, { status: 500 });

  const asked = Number(req.nextUrl.searchParams.get('days'));
  const days = Number.isFinite(asked) && asked > 0 ? Math.min(Math.floor(asked), 10) : 8;
  try {
    const report = await ensureHistory(fetchFinishedDay, days);
    return NextResponse.json(report);
  } catch (err) {
    console.error('[form-history cron] failed:', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
