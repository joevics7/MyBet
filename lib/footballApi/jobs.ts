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

import { fetchFixturesForDate, isApiFootballConfigured, probeApi } from '@/lib/services/apiFootball';
import { saveDayFixtures, saveFinishedDay, getStoredFixtures } from './store';
import { openBudget, SCORE_RUNS_RESERVED, DAILY_CAP } from './budget';
import { ensureHistory, type StoredResult } from '@/lib/services/formHistory';

export const DEFAULT_HISTORY_DAYS_PER_RUN = 12; // 35 days fill in 3 daily runs; ?days=34 does it in one

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

  // 2) history top-up: missing past days, 1 request each (stops when the budget is reached)
  const fetchDay = async (d: string): Promise<StoredResult[]> => {
    if (!budget.tryUse()) throw new Error('request budget reached');
    const list = await fetchFixturesForDate(d);
    return list
      .filter((m) => m.status === 'FINISHED' && m.score.fullTime.home !== null && m.score.fullTime.away !== null)
      .map((m) => [m.homeTeam.id, m.awayTeam.id, m.score.fullTime.home as number, m.score.fullTime.away as number] as StoredResult);
  };
  const history = await ensureHistory(fetchDay, historyDays, 'apifootball').catch((err) => ({ error: String(err) }));
  await budget.flush();

  return { job: 'daily', day, ok: true, matchesToday: matches.length, history, requestsUsedToday: budget.used(), dailyCap: DAILY_CAP };
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
