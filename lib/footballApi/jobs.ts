// The ONLY code that spends API-Football requests. Two jobs, both started by cron-job.org:
//
//  runDailyJob()   1 request  -> the day's whole match list, saved
//                  then picks the best 40 games (tipster coverage first, SportyBet for the games and odds),
//                  and fetches each of their teams' last 10 results: up to 80 requests, saved per team.
//  runScoresJob()  1 request  -> the day's list again with scores/status, saved. Run it ~5 times a day.
//
// Budget: 1 + 80 + 5 = 86 a day. Every request goes through openBudget(), which counts in the database and refuses
// past DAILY_CAP (88), so a bad schedule or a re-run can't push past your 90.

import { fetchFixturesForDate, fetchTeamLastResults, isApiFootballConfigured, probeApi } from '@/lib/services/apiFootball';
import { saveDayFixtures, getStoredFixtures } from './store';
import { openBudget, SCORE_RUNS_RESERVED, DAILY_CAP } from './budget';
import { saveTopup } from '@/lib/services/formHistory';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { fetchFamilyFeed, SPORTYBET } from '@/lib/odds/sportybetFeed';
import { fetchTipsterSources } from '@/lib/services/tipsterConsensus';
import { rankByCoverage } from '@/lib/predictor/shortlist';
import { LOW_SIGNAL } from '@/lib/predictor/candidates';
import { findFixtureByTeamNames } from '@/lib/services/teamMatcher';
import { loadTeamRegistry } from '@/lib/services/teamRegistry';

export const GAMES_PER_DAY = 40; // 40 games = up to 80 teams = up to 80 requests
const FRESH_HOURS = 20;          // a team saved less than this long ago is not fetched again (re-runs cost nothing)
const CONCURRENCY = 4;

const isoDay = (t: number) => new Date(t).toISOString().slice(0, 10);

export interface JobReport {
  job: 'daily' | 'scores';
  day?: string;
  ok: boolean;
  error?: string;
  requestsUsedToday?: number;
  dailyCap?: number;
  [k: string]: unknown;
}

// ---- the daily job -------------------------------------------------------------------------------------------------------

export async function runDailyJob(): Promise<JobReport> {
  const day = isoDay(Date.now());
  if (!isApiFootballConfigured()) return { job: 'daily', day, ok: false, error: 'API_FOOTBALL_KEY is not set, or the account is suspended / out of quota. Nothing was requested.' };

  const budget = await openBudget(SCORE_RUNS_RESERVED);

  // 1) the day's whole list: 1 request
  if (!budget.tryUse()) return { job: 'daily', day, ok: false, error: 'Daily request budget already used. Nothing was requested.', requestsUsedToday: budget.used(), dailyCap: DAILY_CAP };
  let matches;
  try {
    matches = await fetchFixturesForDate(day);
    await saveDayFixtures(day, matches);
  } catch (err) {
    await budget.flush();
    return { job: 'daily', day, ok: false, error: `Match list failed: ${err instanceof Error ? err.message : String(err)}`, requestsUsedToday: budget.used(), dailyCap: DAILY_CAP };
  }

  // 2) choose the best 40: games SportyBet lists (real odds), the ones the most tipster sites cover first
  const now = Date.now();
  const endOfDay = Date.parse(`${day}T23:59:59Z`);
  let feed: Awaited<ReturnType<typeof fetchFamilyFeed>> = [];
  try {
    feed = await fetchFamilyFeed(SPORTYBET, now, endOfDay);
  } catch (err) {
    console.error('[footballApi daily] SportyBet feed failed:', err);
  }
  const games = feed.filter((g) => !LOW_SIGNAL.test(`${g.home} ${g.away} ${g.league}`));
  const sources = await fetchTipsterSources([day]).catch(() => null);
  const registry = await loadTeamRegistry().catch(() => undefined);
  const ranked = rankByCoverage(games.map((g) => ({ ...g, kickoff: g.kickoff })), sources);

  // match each to the SAVED list (no request, no live fallback), until we have 40
  const teamIds = new Set<number>();
  const chosen: { home: string; away: string }[] = [];
  let unmatched = 0;
  for (const r of ranked) {
    if (chosen.length >= GAMES_PER_DAY) break;
    const fx = await findFixtureByTeamNames(r.game.home, r.game.away, r.game.kickoff, registry, 'apifootball');
    if (!fx || (fx.status && fx.status !== 'SCHEDULED')) { unmatched++; continue; }
    chosen.push({ home: r.game.home, away: r.game.away });
    teamIds.add(fx.homeTeamId);
    teamIds.add(fx.awayTeamId);
  }

  // 3) each team's last 10: skip teams saved recently
  const since = new Date(Date.now() - FRESH_HOURS * 3600e3).toISOString();
  const { data: fresh } = await getSupabaseAdmin().from('team_form_topup').select('team_id').eq('provider', 'apifootball').gte('fetched_at', since);
  const have = new Set((fresh ?? []).map((r: { team_id: number }) => Number(r.team_id)));
  const todo = Array.from(teamIds).filter((id) => !have.has(id));

  let fetched = 0;
  let stopped: string | undefined;
  let next = 0;
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      while (!stopped && next < todo.length) {
        const id = todo[next++];
        if (!budget.tryUse()) { stopped = 'request budget reached'; return; }
        try {
          await saveTopup(id, await fetchTeamLastResults(id, 10), 'apifootball');
          fetched++;
        } catch (err) {
          stopped = err instanceof Error ? err.message : String(err);
        }
      }
    }),
  );
  await budget.flush();

  return {
    job: 'daily', day, ok: true,
    matchesToday: matches.length,
    sportyBetGames: games.length,
    gamesChosen: chosen.length,
    gamesNotInList: unmatched,
    teams: teamIds.size,
    teamsAlreadySaved: teamIds.size - todo.length,
    teamsFetchedNow: fetched,
    ...(stopped ? { stopped } : {}),
    requestsUsedToday: budget.used(),
    dailyCap: DAILY_CAP,
  };
}

// ---- the score job -------------------------------------------------------------------------------------------------------

export async function runScoresJob(): Promise<JobReport> {
  // After midnight UTC the late games still belong to yesterday's list; until 06:00 UTC refresh that one instead.
  const day = isoDay(Date.now() - (new Date().getUTCHours() < 6 ? 86400000 : 0));
  if (!isApiFootballConfigured()) return { job: 'scores', day, ok: false, error: 'API_FOOTBALL_KEY is not set, or the account is suspended / out of quota. Nothing was requested.' };

  const budget = await openBudget(0);
  if (!budget.tryUse()) return { job: 'scores', day, ok: false, error: 'Daily request budget already used. Nothing was requested.', requestsUsedToday: budget.used(), dailyCap: DAILY_CAP };
  try {
    const matches = await fetchFixturesForDate(day);
    await saveDayFixtures(day, matches);
    await budget.flush();
    return { job: 'scores', day, ok: true, matches: matches.length, finished: matches.filter((m) => m.status === 'FINISHED').length, requestsUsedToday: budget.used(), dailyCap: DAILY_CAP };
  } catch (err) {
    await budget.flush();
    return { job: 'scores', day, ok: false, error: err instanceof Error ? err.message : String(err), requestsUsedToday: budget.used(), dailyCap: DAILY_CAP };
  }
}

// ---- the probe: what does THIS plan allow? 4 requests, counted in the same daily budget -----------------------------------
export async function runProbe(): Promise<JobReport> {
  if (!isApiFootballConfigured()) return { job: 'daily', ok: false, error: 'API_FOOTBALL_KEY is not set, or the account is suspended / out of quota.' };
  const day = isoDay(Date.now());
  const list = await getStoredFixtures(day, day);
  const sample = list.find((m) => m.status === 'SCHEDULED') ?? list[0];
  if (!sample) return { job: 'daily', ok: false, error: 'No saved match list for today yet: run the daily job first.' };
  const team = sample.homeTeam.id;
  const yesterday = isoDay(Date.now() - 86400000);
  const budget = await openBudget(0);
  const tests: [string, string][] = [
    ['season of one team', `/fixtures?team=${team}&season=2026`],
    ['team + date range', `/fixtures?team=${team}&from=${isoDay(Date.now() - 30 * 86400000)}&to=${yesterday}`],
    ['a past day list', `/fixtures?date=${yesterday}`],
    ['predictions for one game', `/predictions?fixture=${sample.id}`],
  ];
  const out: Record<string, unknown> = {};
  for (const [name, path] of tests) {
    if (!budget.tryUse()) { out[name] = { skipped: 'budget' }; continue; }
    const r = await probeApi(path);
    out[name] = r.ok ? { ok: true, results: r.results } : { ok: false, error: r.error };
  }
  await budget.flush();
  return { job: 'daily', day, ok: true, team: sample.homeTeam.name, game: `${sample.homeTeam.name} v ${sample.awayTeam.name}`, tests: out, requestsUsedToday: budget.used(), dailyCap: DAILY_CAP };
}

export { getStoredFixtures };
