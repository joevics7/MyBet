// Reads/writes the tipster_predictions cache table. The cron
// (/api/cron/tipster-refresh) writes here after live-fetching Statarea/
// Predictz; tipsterConsensus.ts reads from here instead of live-fetching
// on every decode request -- that's the actual fix for burning ZenRows/
// Statarea requests on every single call.

import { getSupabaseAdmin } from '@/lib/supabase-admin';
import type { StatareaPrediction } from './statarea';
import type { PredictzPrediction } from './predictz';

interface TipsterPredictionRow {
  source: 'statarea' | 'predictz' | 'forebet';
  match_date: string;
  home_team: string;
  away_team: string;
  home_win_pct: number | null;
  draw_pct: number | null;
  away_win_pct: number | null;
  over_15_pct: number | null;
  over_25_pct: number | null;
  over_35_pct: number | null;
  btts_yes_pct: number | null;
  btts_no_pct: number | null;
  predicted_home_score: number | null;
  predicted_away_score: number | null;
  odds_home: number | null;
  odds_draw: number | null;
  odds_away: number | null;
}

// Replaces (not merges) a source's rows for one date -- the cron runs
// daily per date, so stale rows from a previous run for that exact
// date/source should never linger.
export async function upsertTipsterPredictions(
  source: 'statarea' | 'predictz' | 'forebet',
  matchDate: string,
  rows: Omit<TipsterPredictionRow, 'source' | 'match_date'>[],
): Promise<void> {
  const admin = getSupabaseAdmin();

  await admin.from('tipster_predictions').delete().eq('source', source).eq('match_date', matchDate);

  if (rows.length === 0) return; // nothing to insert -- a 0-result day is still a successful "refresh", just empty

  await admin.from('tipster_predictions').insert(
    rows.map((r) => ({ source, match_date: matchDate, ...r })),
  );
}

export interface CachedTipsterSources {
  statarea: StatareaPrediction[];
  predictz: PredictzPrediction[];
}

// Reads whatever is cached for the given dates -- does NOT live-fetch as
// a fallback. If the cron hasn't run for a date yet, that date simply has
// no tipster data (same UX as any other "not covered" case); the fix is
// making sure the cron runs reliably, not silently falling back to a
// live fetch that would reintroduce the per-request cost this exists to
// avoid.
export async function getCachedTipsterSources(dates: string[]): Promise<CachedTipsterSources> {
  const uniqueDates = Array.from(new Set(dates.filter(Boolean)));
  if (uniqueDates.length === 0) return { statarea: [], predictz: [] };

  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from('tipster_predictions')
    .select('*')
    .in('match_date', uniqueDates);

  if (error || !data) {
    console.error('[tipsterCache] read failed:', error);
    return { statarea: [], predictz: [] };
  }

  const rows = data as TipsterPredictionRow[];

  const statarea: StatareaPrediction[] = rows
    .filter((r) => r.source === 'statarea')
    .map((r) => ({
      date: r.match_date,
      time: '', // not stored -- unused by matching/scoring, only kept on the live-fetched type for display
      homeTeam: r.home_team,
      awayTeam: r.away_team,
      tip: '',
      homeWinPercent: r.home_win_pct ?? 0,
      drawPercent: r.draw_pct ?? 0,
      awayWinPercent: r.away_win_pct ?? 0,
      htHomeWinPercent: 0,
      htDrawPercent: 0,
      htAwayWinPercent: 0,
      over15Percent: r.over_15_pct ?? 0,
      over25Percent: r.over_25_pct ?? 0,
      over35Percent: r.over_35_pct ?? 0,
      bttsYesPercent: r.btts_yes_pct ?? 0,
      bttsNoPercent: r.btts_no_pct ?? 0,
    }));

  const predictz: PredictzPrediction[] = rows
    .filter((r) => r.source === 'predictz')
    .map((r) => ({
      homeTeam: r.home_team,
      awayTeam: r.away_team,
      predictedScore:
        r.predicted_home_score !== null && r.predicted_away_score !== null
          ? { home: r.predicted_home_score, away: r.predicted_away_score }
          : null,
      oddsHome: r.odds_home,
      oddsDraw: r.odds_draw,
      oddsAway: r.odds_away,
    }));

  return { statarea, predictz };
}
