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
import type { TeamMatchResult } from './poissonModel';

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
let cache: { at: number; index: Index | null } | null = null;

async function loadIndex(): Promise<Index | null> {
  if (cache && Date.now() - cache.at < (cache.index ? INDEX_TTL_MS : FAILED_TTL_MS)) return cache.index;
  try {
    const days = windowDays();
    const { data, error } = await getSupabaseAdmin()
      .from('football_results_by_day')
      .select('day, results')
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
    cache = { at: Date.now(), index: { coveredDays: data?.length ?? 0, byTeam } };
  } catch (err) {
    console.error('[formHistory] could not load stored results (table missing or Supabase down?):', err);
    cache = { at: Date.now(), index: null };
  }
  return cache.index;
}

// Recent results for a team (most recent first), or null when the stored history is not ready yet.
export async function lookupForm(teamId: number, limit = 10): Promise<TeamMatchResult[] | null> {
  const index = await loadIndex();
  if (!index || index.coveredDays < MIN_DAYS_TO_USE) return null;
  return (index.byTeam.get(teamId) ?? []).slice(0, limit);
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
): Promise<HistoryReport> {
  const admin = getSupabaseAdmin();
  const days = windowDays();
  const { data, error } = await admin.from('football_results_by_day').select('day').gte('day', days[days.length - 1]).lte('day', days[0]);
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
        .upsert({ day, results, match_count: results.length, fetched_at: new Date().toISOString() });
      if (upErr) throw new Error(upErr.message);
      fetchedNow++;
    } catch (err) {
      stopped = err instanceof Error ? err.message : String(err);
      console.error('[formHistory] stopped while fetching', day, err);
      break; // a rate-limit or quota error: do not keep hammering
    }
  }
  if (fetchedNow > 0) cache = null;

  const stored = have.size + fetchedNow;
  return { stored, missing: days.length - stored, fetchedNow, ready: stored >= MIN_DAYS_TO_USE, ...(stopped ? { stopped } : {}) };
}
