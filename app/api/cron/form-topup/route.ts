import { NextRequest, NextResponse } from 'next/server';
import { fetchMatchesByDateRange, fetchTeamLastResults, isApiFootballConfigured } from '@/lib/services/apiFootball';
import { fetchTipsterSources } from '@/lib/services/tipsterConsensus';
import { rankByCoverage } from '@/lib/predictor/shortlist';
import { LOW_SIGNAL, MAX_GAMES_PER_RUN, FIXTURE_WINDOW_DAYS } from '@/lib/predictor/candidates';
import { saveTopup, teamsNeedingTopup, topupsUsedToday } from '@/lib/services/formHistory';

export const runtime = 'nodejs';
export const maxDuration = 60;

// OPERATING NOTES -- Form top-up (feeds the Daily Predictor)
// - The Predictor builds team form from the stored 35-day history (free). A few teams (thin leagues, international
//   breaks) have fewer than 5 results there. For THOSE teams only, this job fetches their last 10 results, one
//   API-Football request per team, and stores them for 3 days (table team_form_topup).
// - It works on the same shortlist the Predictor analyses (the 45 best-covered games of the next days), so no request is
//   spent on a team the Predictor will not look at.
// - Free plan = 10 requests/minute and 100/day, so each call fetches at most ?max=6 teams (default 6, cap 9), and the
//   job stops for the day at 40 top-up requests, leaving the rest of the quota for the Decoder.
// - Trigger: cron-job.org, GET https://<your-domain>/api/cron/form-topup, header Authorization: Bearer <CRON_SECRET>.
//   Run it every 2 minutes for ~20 minutes BEFORE the Predictor; once nothing is missing it returns immediately and costs nothing.
const DAILY_CAP = 40;

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV !== 'production';
  return req.headers.get('authorization') === `Bearer ${secret}`;
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isApiFootballConfigured()) return NextResponse.json({ error: 'API_FOOTBALL_KEY is not set.' }, { status: 500 });

  const asked = Number(req.nextUrl.searchParams.get('max'));
  const max = Number.isFinite(asked) && asked > 0 ? Math.min(Math.floor(asked), 9) : 6;

  try {
    const dates = Array.from({ length: FIXTURE_WINDOW_DAYS + 1 }, (_, i) => new Date(Date.now() + i * 86400000).toISOString().slice(0, 10));
    const fixtures = await fetchMatchesByDateRange(dates[0], dates[dates.length - 1]);
    const upcoming = Array.from(new Map(fixtures.map((f) => [f.id, f])).values()).filter(
      (f) => (f.status === 'SCHEDULED' || f.status === 'TIMED') && !LOW_SIGNAL.test(`${f.homeTeam.name} ${f.awayTeam.name} ${f.competition.name}`),
    );
    const sources = await fetchTipsterSources(dates).catch(() => null);
    const shortlist = rankByCoverage(upcoming.map((f) => ({ home: f.homeTeam.name, away: f.awayTeam.name, kickoff: f.utcDate, f })), sources).slice(0, MAX_GAMES_PER_RUN);

    const teamIds = Array.from(new Set(shortlist.flatMap((r) => [r.game.f.homeTeam.id, r.game.f.awayTeam.id])));
    const missing = await teamsNeedingTopup(teamIds);
    const usedToday = await topupsUsedToday();
    const allowed = Math.max(0, Math.min(max, DAILY_CAP - usedToday));

    let fetched = 0;
    let stopped: string | undefined;
    for (const id of missing.slice(0, allowed)) {
      try {
        await saveTopup(id, await fetchTeamLastResults(id, 10));
        fetched++;
      } catch (err) {
        stopped = err instanceof Error ? err.message : String(err);
        break; // rate limit or quota: stop, the next call continues
      }
    }

    return NextResponse.json({
      shortlistedGames: shortlist.length,
      teams: teamIds.length,
      teamsNeedingTopup: missing.length,
      fetchedNow: fetched,
      stillMissing: missing.length - fetched,
      usedLast24h: usedToday + fetched,
      dailyCap: DAILY_CAP,
      ...(stopped ? { stopped } : {}),
      ...(allowed === 0 && missing.length > 0 ? { note: 'Daily top-up cap reached; the rest wait until tomorrow.' } : {}),
    });
  } catch (err) {
    console.error('[form-topup cron] failed:', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err), step: 'see error text; it names the API or table that failed' }, { status: 500 });
  }
}
