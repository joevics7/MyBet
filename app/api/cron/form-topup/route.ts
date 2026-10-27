import { NextRequest, NextResponse } from 'next/server';
import { fetchMatchesByDateRange as afFetchRange, fetchTeamLastResults as afLast, isApiFootballConfigured } from '@/lib/services/apiFootball';
import { fetchMatchesByDateRange as fdFetchRange, fetchTeamLastResults as fdLast } from '@/lib/services/footballData';
import { fetchTipsterSources } from '@/lib/services/tipsterConsensus';
import { rankByCoverage } from '@/lib/predictor/shortlist';
import { LOW_SIGNAL, MAX_GAMES_PER_RUN, FIXTURE_WINDOW_DAYS } from '@/lib/predictor/candidates';
import { saveTopup, teamsNeedingTopup, topupsUsedToday, type HistoryProvider } from '@/lib/services/formHistory';

export const runtime = 'nodejs';
export const maxDuration = 60;

// OPERATING NOTES -- Form top-up (feeds the Daily Predictor)
// - The Predictor builds team form from the stored 35-day history (free). A team with fewer than 5 results there (a thin
//   league, a break) gets its last 10 results fetched here, one request per team, and kept for 3 days (team_form_topup).
// - It works on the same shortlist the Predictor analyses (the 45 best-covered games of the next days), so no request is
//   spent on a team the Predictor will not look at.
// - Provider: football-data.org by default (?provider=footballdata): 10 requests/minute, no daily cap, 12 competitions.
//   ?provider=apifootball uses API-Football instead: 100 requests/day, so it stops at 40 top-ups a day.
// - Each call fetches at most ?max=8 teams (default 8, cap 9) to stay under the per-minute limit.
// - Trigger: cron-job.org, GET https://<your-domain>/api/cron/form-topup, header Authorization: Bearer <CRON_SECRET>.
//   Run it every 2 minutes for ~30 minutes BEFORE the Predictor; once nothing is missing it returns immediately and costs nothing.
const AF_DAILY_CAP = 40;

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV !== 'production';
  return req.headers.get('authorization') === `Bearer ${secret}`;
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const provider: HistoryProvider = req.nextUrl.searchParams.get('provider') === 'apifootball' ? 'apifootball' : 'footballdata';
  if (provider === 'apifootball' && !isApiFootballConfigured()) {
    return NextResponse.json({ error: 'API_FOOTBALL_KEY is not set (or the account is suspended).' }, { status: 500 });
  }
  if (provider === 'footballdata' && !process.env.FOOTBALL_DATA_API_KEY) {
    return NextResponse.json({ error: 'FOOTBALL_DATA_API_KEY is not set.' }, { status: 500 });
  }

  const asked = Number(req.nextUrl.searchParams.get('max'));
  const max = Number.isFinite(asked) && asked > 0 ? Math.min(Math.floor(asked), 9) : 8;
  const startedAt = Date.now();

  try {
    const dates = Array.from({ length: FIXTURE_WINDOW_DAYS + 1 }, (_, i) => new Date(Date.now() + i * 86400000).toISOString().slice(0, 10));
    const fixtures = await (provider === 'apifootball' ? afFetchRange : fdFetchRange)(dates[0], dates[dates.length - 1]);
    const upcoming = Array.from(new Map(fixtures.map((f) => [f.id, f])).values()).filter(
      (f) => (f.status === 'SCHEDULED' || f.status === 'TIMED') && !LOW_SIGNAL.test(`${f.homeTeam.name} ${f.awayTeam.name} ${f.competition.name}`),
    );
    const sources = await fetchTipsterSources(dates).catch(() => null);
    const shortlist = rankByCoverage(upcoming.map((f) => ({ home: f.homeTeam.name, away: f.awayTeam.name, kickoff: f.utcDate, f })), sources).slice(0, MAX_GAMES_PER_RUN);

    const teamIds = Array.from(new Set(shortlist.flatMap((r) => [r.game.f.homeTeam.id, r.game.f.awayTeam.id])));
    const missing = await teamsNeedingTopup(teamIds, provider);
    const usedToday = await topupsUsedToday(provider);
    const allowed = provider === 'apifootball' ? Math.max(0, Math.min(max, AF_DAILY_CAP - usedToday)) : max;

    let fetched = 0;
    let stopped: string | undefined;
    for (const id of missing.slice(0, allowed)) {
      try {
        await saveTopup(id, await (provider === 'apifootball' ? afLast : fdLast)(id, 10), provider);
        fetched++;
      } catch (err) {
        stopped = err instanceof Error ? err.message : String(err);
        break; // rate limit or quota: stop, the next call continues
      }
    }

    return NextResponse.json({
      provider,
      tookMs: Date.now() - startedAt,
      shortlistedGames: shortlist.length,
      teams: teamIds.length,
      teamsNeedingTopup: missing.length,
      fetchedNow: fetched,
      stillMissing: missing.length - fetched,
      ...(provider === 'apifootball' ? { usedLast24h: usedToday + fetched, dailyCap: AF_DAILY_CAP } : {}),
      ...(stopped ? { stopped } : {}),
    });
  } catch (err) {
    console.error('[form-topup cron] failed:', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
