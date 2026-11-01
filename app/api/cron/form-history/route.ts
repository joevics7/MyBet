import { NextRequest, NextResponse } from 'next/server';
import { ensureHistoryByRange } from '@/lib/services/formHistory';
import { fetchFinishedRange } from '@/lib/services/footballData';

export const runtime = 'nodejs';
export const maxDuration = 60;

// OPERATING NOTES -- Form history (feeds the Predictor and the Decoder's confidence score)
// - Fills the football_results_by_day table: the last 35 days of FINISHED matches, stored once per provider. Team form is
//   then built from it with no API requests. Needs the migrations 20261015000000 and 20261023000000.
// - football-data.org (default): ONE request returns ~9 days of the 12 free competitions, so the whole 35 days take 4
//   requests (free tier: 10/min). Needs FOOTBALL_DATA_API_KEY. Covers only those 12 leagues.
// - API-Football (optional, ?provider=apifootball or both): one request per past day, all leagues. Needs API_FOOTBALL_KEY
//   and an active account. ?days=N (max 10) sets how many days one call may fetch.
// - First setup: call this URL once or twice (a minute apart). After that it only refreshes the newest block (1 request).
// - Trigger: cron-job.org, GET https://<your-domain>/api/cron/form-history, header Authorization: Bearer <CRON_SECRET>. Daily.
function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV !== 'production';
  return req.headers.get('authorization') === `Bearer ${secret}`;
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const provider = req.nextUrl.searchParams.get('provider') ?? 'footballdata';
  const report: Record<string, unknown> = {};

  try {
    if (provider === 'footballdata' || provider === 'both') {
      if (!process.env.FOOTBALL_DATA_API_KEY) report.footballdata = { error: 'FOOTBALL_DATA_API_KEY is not set.' };
      else report.footballdata = await ensureHistoryByRange(fetchFinishedRange, 4, 'footballdata');
    }
    if (provider === 'apifootball' || provider === 'both') {
      report.apifootball = { error: 'Retired: API-Football is only used by /api/cron/football-daily and /api/cron/football-scores.' };
    }
    if (Object.keys(report).length === 0) return NextResponse.json({ error: 'provider must be footballdata, apifootball or both' }, { status: 400 });
    return NextResponse.json(report);
  } catch (err) {
    console.error('[form-history cron] failed:', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err), ...report }, { status: 500 });
  }
}
