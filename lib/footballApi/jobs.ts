// The ONLY code that spends API-Football requests. Two jobs, both started by cron-job.org:
//
//  runDailyJob()   1 request  -> the day's whole match list, saved.
//                  Then tops up the results history (team form is built from it): up to ?days=N missing past days, 1 request
//                  each, newest first. Per-team "last 10" requests are NOT used: the free plan refuses them.
//  runScoresJob()  1 request  -> the day's list again with scores/status, saved. Run it ~5 times a day. When it refreshes a
//                  PAST day (before 06:00 UTC, i.e. yesterday's late games) it also files that day's finished results into
//                  the history for free, so after the first fill the history keeps itself up to date.
//
// Budget: every request goes through openBudget(), which counts in the database and refuses past DAILY_CAP (88).
// The daily job leaves 5 requests for the score runs.

import { fetchFixturesForDate, fetchPrediction, isApiFootballConfigured, probeApi } from '@/lib/services/apiFootball';
import { saveDayFixtures, saveFinishedDay, getStoredFixtures } from './store';
import { openBudget, SCORE_RUNS_RESERVED, DAILY_CAP } from './budget';
import { ensureHistory, type StoredResult } from '@/lib/services/formHistory';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { fetchFamilyFeed, SPORTYBET } from '@/lib/odds/sportybetFeed';
import { fetchTipsterSources } from '@/lib/services/tipsterConsensus';
import { rankByCoverage } from '@/lib/predictor/shortlist';
import { LOW_SIGNAL } from '@/lib/predictor/candidates';
import { findFixtureByTeamNames } from '@/lib/services/teamMatcher';
import { loadTeamRegistry } from '@/lib/services/teamRegistry';

export const DEFAULT_HISTORY_DAYS_PER_RUN = 1; // the free plan only serves yesterday..tomorrow, so only yesterday can be filled
export const GAMES_PER_DAY = 40;
export const PREDICTIONS_PER_RUN = 7;      // ~10 requests/minute on the free plan: 7 spaced 6.5s apart fits one run
const GAP_MS = 6500;

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

export async function runDailyJob(historyDays = DEFAULT_HISTORY_DAYS_PER_RUN): Promise<JobReport> {
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

  // 2) choose today's best 40 games (no requests): tipster coverage first, games SportyBet lists; keep their fixture ids
  const selected = await selectBestGames(day).catch((err) => { console.error('[footballApi daily] selection failed:', err); return null; });

  // 3) history top-up: yesterday if the score job has not filed it (older days are refused by the free plan)
  const fetchDay = async (d: string): Promise<StoredResult[]> => {
    if (!budget.tryUse()) throw new Error('request budget reached');
    const list = await fetchFixturesForDate(d);
    return list
      .filter((m) => m.status === 'FINISHED' && m.score.fullTime.home !== null && m.score.fullTime.away !== null)
      .map((m) => [m.homeTeam.id, m.awayTeam.id, m.score.fullTime.home as number, m.score.fullTime.away as number] as StoredResult);
  };
  const history = await ensureHistory(fetchDay, historyDays, 'apifootball').catch((err) => ({ error: String(err) }));
  await budget.flush();

  return { job: 'daily', day, ok: true, matchesToday: matches.length, selected, history, requestsUsedToday: budget.used(), dailyCap: DAILY_CAP };
}

// Pick the day's best games and queue them in football_predictions (data = null until the predictions job fills them).
async function selectBestGames(day: string): Promise<{ queued: number; sportyBetGames: number; notInList: number }> {
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

  const rows: Record<string, unknown>[] = [];
  const seen = new Set<number>();
  let notInList = 0;
  for (const r of ranked) {
    if (rows.length >= GAMES_PER_DAY) break;
    // the SAVED list only (no request, no live fallback)
    const fx = await findFixtureByTeamNames(r.game.home, r.game.away, r.game.kickoff, registry, 'apifootball');
    if (!fx || (fx.status && fx.status !== 'SCHEDULED') || seen.has(fx.matchId)) { notInList++; continue; }
    seen.add(fx.matchId);
    rows.push({
      fixture_id: fx.matchId, day, rank: rows.length + 1,
      home_team_id: fx.homeTeamId, home_name: fx.homeTeamName, away_team_id: fx.awayTeamId, away_name: fx.awayTeamName,
      kickoff: r.game.kickoff ? new Date(r.game.kickoff).toISOString() : null,
    });
  }
  if (rows.length > 0) {
    // ignoreDuplicates: a re-run must not wipe predictions already fetched
    const { error } = await getSupabaseAdmin().from('football_predictions').upsert(rows, { onConflict: 'fixture_id', ignoreDuplicates: true });
    if (error) throw new Error(error.message);
  }
  return { queued: rows.length, sportyBetGames: games.length, notInList };
}

// ---- the predictions job: fills a few queued games per run (cron-job.org every ~5 minutes for an hour) -------------------

export async function runPredictionsJob(perRun = PREDICTIONS_PER_RUN): Promise<JobReport> {
  const day = isoDay(Date.now());
  if (!isApiFootballConfigured()) return { job: 'daily', day, ok: false, error: 'API_FOOTBALL_KEY is not set, the account is suspended / out of quota, or the per-minute limit is cooling off. Nothing was requested.' };

  const admin = getSupabaseAdmin();
  const { data: pending, error } = await admin.from('football_predictions').select('fixture_id,home_name,away_name').eq('day', day).is('data', null).order('rank', { ascending: true }).limit(perRun);
  if (error) return { job: 'daily', day, ok: false, error: `Cannot read the queue (run the football_predictions migration?): ${error.message}` };
  if (!pending || pending.length === 0) return { job: 'daily', day, ok: true, fetchedNow: 0, note: 'Nothing queued for today (already done, or the daily job has not run).' };

  const budget = await openBudget(SCORE_RUNS_RESERVED);
  let fetched = 0;
  let stopped: string | undefined;
  for (let i = 0; i < pending.length; i++) {
    if (!budget.tryUse()) { stopped = 'request budget reached'; break; }
    try {
      const data = await fetchPrediction(Number(pending[i].fixture_id));
      const { error: upErr } = await admin.from('football_predictions').update({ data: data ?? { empty: true }, fetched_at: new Date().toISOString() }).eq('fixture_id', pending[i].fixture_id);
      if (upErr) throw new Error(upErr.message);
      fetched++;
    } catch (err) {
      stopped = err instanceof Error ? err.message : String(err);
      break;
    }
    if (i < pending.length - 1) await new Promise((r) => setTimeout(r, GAP_MS));
  }
  await budget.flush();
  const { count } = await admin.from('football_predictions').select('fixture_id', { count: 'exact', head: true }).eq('day', day).is('data', null);
  return { job: 'daily', day, ok: true, fetchedNow: fetched, stillQueued: count ?? null, ...(stopped ? { stopped } : {}), requestsUsedToday: budget.used(), dailyCap: DAILY_CAP };
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
    if (day < isoDay(Date.now())) await saveFinishedDay(day, matches); // a past day is final: file it into the history
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
