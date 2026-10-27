// Team form from stored daily results, instead of one API-Football request per team.
//
// Why: API-Football's free plan allows 100 requests a day and `/fixtures?team=<id>&last=10` costs one request
// PER TEAM, so scanning ~60 games burned 120+ requests. `/fixtures?date=<day>` returns EVERY league's fixtures
// for a day in ONE request, and a past day never changes. So we fetch each past day once, keep the finished
// results in Supabase (table football_results_by_day), and build any team's form from them for free.
//
//  - ensureHistory() fetches missing past days (newest first), a few per call, and stores them.
//  - lookupForm() answers a team's recent results from the stored days, or null when history is not ready
//    (table missing, Supabase down, or fewer than MIN_DAYS_TO_USE days stored) -- the caller then falls back
//    to the old per-team request, so nothing breaks while the history is still filling.
//  - A team with fewer than 5 results in the window simply has too little data (no extra request is spent).

import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { TOPUP_BELOW, type TeamMatchResult } from './poissonModel';

export const HISTORY_DAYS = 35;      // how far back the form window reaches
export const MIN_DAYS_TO_USE = 21;   // form is served from history only once this many days are stored
const INDEX_TTL_MS = 30 * 60 * 1000;
const FAILED_TTL_MS = 5 * 60 * 1000;

// [homeTeamId, awayTeamId, homeGoals, awayGoals]
export type StoredResult = [number, number, number, number];

const isoDay = (t: number) => new Date(t).toISOString().slice(0, 10);

// The days the window covers: yesterday back HISTORY_DAYS days (today's matches are not finished yet).
export function windowDays(now = Date.now()): string[] {
  return Array.from({ length: HISTORY_DAYS }, (_, i) => isoDay(now - (i + 1) * 86400000));
}

interface Index {
  coveredDays: number;
  byTeam: Map<number, TeamMatchResult[]>; // most recent first
}
export type HistoryProvider = 'apifootball' | 'footballdata'; // team ids differ between them, so each has its own stored days
const caches = new Map<HistoryProvider, { at: number; index: Index | null }>();

async function loadIndex(provider: HistoryProvider = 'apifootball'): Promise<Index | null> {
  const hit = caches.get(provider);
  if (hit && Date.now() - hit.at < (hit.index ? INDEX_TTL_MS : FAILED_TTL_MS)) return hit.index;
  try {
    const days = windowDays();
    const { data, error } = await getSupabaseAdmin()
      .from('football_results_by_day')
      .select('day, results')
      .eq('provider', provider)
      .gte('day', days[days.length - 1])
      .lte('day', days[0])
      .order('day', { ascending: false });
    if (error) throw new Error(error.message);

    const byTeam = new Map<number, TeamMatchResult[]>();
    const push = (team: number, r: TeamMatchResult) => {
      const list = byTeam.get(team);
      if (list) list.push(r);
      else byTeam.set(team, [r]);
    };
    for (const row of data ?? []) {
      for (const [home, away, hg, ag] of row.results as StoredResult[]) {
        push(home, { goalsFor: hg, goalsAgainst: ag, isHome: true });
        push(away, { goalsFor: ag, goalsAgainst: hg, isHome: false });
      }
    }
    caches.set(provider, { at: Date.now(), index: { coveredDays: data?.length ?? 0, byTeam } });
  } catch (err) {
    console.error('[formHistory] could not load stored results (table missing or Supabase down?):', err);
    caches.set(provider, { at: Date.now(), index: null });
  }
  return caches.get(provider)!.index;
}

// ---- Top-ups: last-10 results fetched per team, only for teams the 35-day history cannot cover --------------------------
export const TOPUP_MAX_AGE_DAYS = 3;
const topupCaches = new Map<HistoryProvider, { at: number; map: Map<number, TeamMatchResult[]> }>();

async function loadTopups(provider: HistoryProvider): Promise<Map<number, TeamMatchResult[]>> {
  const hit = topupCaches.get(provider);
  if (hit && Date.now() - hit.at < 10 * 60 * 1000) return hit.map;
  const map = new Map<number, TeamMatchResult[]>();
  try {
    const since = new Date(Date.now() - TOPUP_MAX_AGE_DAYS * 86400000).toISOString();
    const { data, error } = await getSupabaseAdmin().from('team_form_topup').select('team_id, results').eq('provider', provider).gte('fetched_at', since);
    if (error) throw new Error(error.message);
    for (const row of data ?? []) map.set(Number(row.team_id), row.results as TeamMatchResult[]);
  } catch (err) {
    console.error('[formHistory] could not load top-ups (table missing?):', err);
  }
  topupCaches.set(provider, { at: Date.now(), map });
  return map;
}

export async function saveTopup(teamId: number, results: TeamMatchResult[], provider: HistoryProvider = 'apifootball'): Promise<void> {
  const { error } = await getSupabaseAdmin()
    .from('team_form_topup')
    .upsert({ team_id: teamId, provider, results, fetched_at: new Date().toISOString() }, { onConflict: 'team_id,provider' });
  if (error) throw new Error(error.message);
  topupCaches.delete(provider);
}

// How many top-up requests this provider has used in the last 24 hours (one request per stored team).
export async function topupsUsedToday(provider: HistoryProvider = 'apifootball'): Promise<number> {
  const since = new Date(Date.now() - 86400000).toISOString();
  const { count } = await getSupabaseAdmin().from('team_form_topup').select('team_id', { count: 'exact', head: true }).eq('provider', provider).gte('fetched_at', since);
  return count ?? 0;
}

// Of these teams, the ones with fewer than TOPUP_BELOW results in the history AND no fresh top-up (order kept).
export async function teamsNeedingTopup(teamIds: number[], provider: HistoryProvider = 'apifootball'): Promise<number[]> {
  const [index, topups] = await Promise.all([loadIndex(provider), loadTopups(provider)]);
  return teamIds.filter((id) => (index?.byTeam.get(id)?.length ?? 0) < TOPUP_BELOW && !topups.has(id));
}

// Recent results for a team (most recent first), or null when no stored data can answer yet.
export async function lookupForm(teamId: number, limit = 10, provider: HistoryProvider = 'apifootball'): Promise<TeamMatchResult[] | null> {
  const [index, topups] = await Promise.all([loadIndex(provider), loadTopups(provider)]);
  const topup = topups.get(teamId);
  const historyReady = !!index && index.coveredDays >= MIN_DAYS_TO_USE;
  const own = historyReady ? index!.byTeam.get(teamId) ?? [] : [];
  if (historyReady && own.length >= TOPUP_BELOW) return own.slice(0, limit);
  // History is thin or not ready for this team: the top-up (last 10, any date) is the better answer when we have one.
  if (topup && topup.length > own.length) return topup.slice(0, limit);
  return historyReady ? own.slice(0, limit) : null;
}

export interface HistoryReport {
  stored: number;     // days stored inside the window
  missing: number;    // days still to fetch
  fetchedNow: number; // days fetched by this call
  ready: boolean;     // enough days stored for form to be served from history
  stopped?: string;   // why a fetch run ended early (rate limit, error)
}

// Fetches up to `maxNewDays` missing past days (newest first) and stores them. `fetchDay` returns the finished
// results for one date; it is injected so this file never imports the API client (no circular import).
export async function ensureHistory(
  fetchDay: (day: string) => Promise<StoredResult[]>,
  maxNewDays: number,
  provider: HistoryProvider = 'apifootball',
): Promise<HistoryReport> {
  const admin = getSupabaseAdmin();
  const days = windowDays();
  const { data, error } = await admin.from('football_results_by_day').select('day').eq('provider', provider).gte('day', days[days.length - 1]).lte('day', days[0]);
  if (error) {
    return { stored: 0, missing: days.length, fetchedNow: 0, ready: false, stopped: `table not readable: ${error.message}` };
  }
  const have = new Set((data ?? []).map((r) => String(r.day)));
  const missing = days.filter((d) => !have.has(d)); // newest first

  let fetchedNow = 0;
  let stopped: string | undefined;
  for (const day of missing.slice(0, Math.max(0, maxNewDays))) {
    try {
      const results = await fetchDay(day);
      const { error: upErr } = await admin
        .from('football_results_by_day')
        .upsert({ day, provider, results, match_count: results.length, fetched_at: new Date().toISOString() }, { onConflict: 'day,provider' });
      if (upErr) throw new Error(upErr.message);
      fetchedNow++;
    } catch (err) {
      stopped = err instanceof Error ? err.message : String(err);
      console.error('[formHistory] stopped while fetching', day, err);
      break; // a rate-limit or quota error: do not keep hammering
    }
  }
  if (fetchedNow > 0) caches.delete(provider);

  const stored = have.size + fetchedNow;
  return { stored, missing: days.length - stored, fetchedNow, ready: stored >= MIN_DAYS_TO_USE, ...(stopped ? { stopped } : {}) };
}

// ---- Range fetchers (football-data.org): ONE request returns several days, split here into per-day rows ----------------
export const RANGE_BLOCK_DAYS = 9; // football-data.org allows a 10-day range; the request adds one extra day at the end

// Blocks of consecutive window days (newest first) that still have at least one missing day. Pure.
export function planBlocks(days: string[], have: Set<string>, blockSize = RANGE_BLOCK_DAYS): { days: string[]; from: string; to: string }[] {
  const blocks: { days: string[]; from: string; to: string }[] = [];
  for (let i = 0; i < days.length; i += blockSize) {
    const block = days.slice(i, i + blockSize);
    if (block.every((d) => have.has(d))) continue;
    blocks.push({ days: block, from: block[block.length - 1], to: block[0] });
  }
  return blocks;
}

export async function ensureHistoryByRange(
  fetchRange: (from: string, to: string) => Promise<Map<string, StoredResult[]>>,
  maxRequests: number,
  provider: HistoryProvider,
): Promise<HistoryReport & { requests: number }> {
  const admin = getSupabaseAdmin();
  const days = windowDays();
  const { data, error } = await admin.from('football_results_by_day').select('day').eq('provider', provider).gte('day', days[days.length - 1]).lte('day', days[0]);
  if (error) return { stored: 0, missing: days.length, fetchedNow: 0, ready: false, requests: 0, stopped: `table not readable: ${error.message}` };
  const have = new Set((data ?? []).map((r) => String(r.day)));

  let fetchedNow = 0;
  let requests = 0;
  let stopped: string | undefined;
  for (const block of planBlocks(days, have).slice(0, Math.max(0, maxRequests))) {
    try {
      requests++;
      const byDay = await fetchRange(block.from, block.to);
      const rows = block.days
        .filter((d) => !have.has(d))
        .map((day) => {
          const results = byDay.get(day) ?? []; // a day with no finished matches is still a (complete) day
          return { day, provider, results, match_count: results.length, fetched_at: new Date().toISOString() };
        });
      const { error: upErr } = await admin.from('football_results_by_day').upsert(rows, { onConflict: 'day,provider' });
      if (upErr) throw new Error(upErr.message);
      fetchedNow += rows.length;
      rows.forEach((r) => have.add(r.day));
    } catch (err) {
      stopped = err instanceof Error ? err.message : String(err);
      console.error('[formHistory] range fetch stopped', block.from, block.to, err);
      break;
    }
  }
  if (fetchedNow > 0) caches.delete(provider);
  const stored = have.size;
  return { stored, missing: days.length - stored, fetchedNow, requests, ready: stored >= MIN_DAYS_TO_USE, ...(stopped ? { stopped } : {}) };
}
