// The day's analysed games (best suggested bet each) and their results.
//  saveAnalysedGames(): called by the predictor run. Keeps the best-scoring market per game, top 40 games, and drops
//                       rows older than 3 days (the history window).
//  settleGames():       compares the saved final scores with the suggested bet and marks it won / lost / void.
//                       Reads saved data only: no API request. Called after every score job.

import { getSupabaseAdmin } from '@/lib/supabase-admin';
import type { CandidateSelection } from '@/lib/services/predictorSelection';
import { deriveMarketFromScore } from '@/lib/services/scoreToMarkets';
import { findFixtureByTeamNames } from '@/lib/services/teamMatcher';
import { loadTeamRegistry } from '@/lib/services/teamRegistry';

export const GAMES_SHOWN = 40;
export const HISTORY_DAYS = 3; // today + the 2 days before
const SETTLE_AFTER_KICKOFF_MS = 3600e3; // a saved "finished" status is what settles a game; this only skips games that cannot be over yet

const isoDay = (t: number) => new Date(t).toISOString().slice(0, 10);

export async function saveAnalysedGames(date: string, candidates: CandidateSelection[]): Promise<{ saved: number; error?: string }> {
  // best market per game; only games with a SportyBet id (that is what a booking code is built from)
  const best = new Map<string, CandidateSelection>();
  for (const c of candidates) {
    if (!c.gameKey || !c.selector || !c.externalEventId.startsWith('sr:match:')) continue;
    const cur = best.get(c.gameKey);
    if (!cur || c.score > cur.score) best.set(c.gameKey, c);
  }
  const rows = Array.from(best.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, GAMES_SHOWN)
    .map((c) => ({
      game_date: date,
      game_key: c.gameKey!,
      external_event_id: c.externalEventId,
      home_team: c.homeTeam,
      away_team: c.awayTeam,
      competition: c.competition,
      kickoff_at: c.kickoffAt ? new Date(c.kickoffAt).toISOString() : null,
      market: c.market,
      selector: c.selector,
      confidence: c.score,
      probability: c.probability ?? null,
      odds: c.odds,
      model_source: c.modelSource ?? null,
    }));
  const admin = getSupabaseAdmin();
  // history window: keep today and the 2 days before
  await admin.from('predictor_games').delete().lt('game_date', isoDay(Date.parse(`${date}T00:00:00Z`) - (HISTORY_DAYS - 1) * 86400000));
  if (rows.length === 0) return { saved: 0 };
  // ignoreDuplicates: a re-run must not wipe a result that is already marked
  const { error } = await admin.from('predictor_games').upsert(rows, { onConflict: 'game_date,game_key', ignoreDuplicates: true });
  return error ? { saved: 0, error: error.message } : { saved: rows.length };
}

export interface SettleReport { checked: number; won: number; lost: number; void: number; stillPending: number; notFound: number }

export async function settleGames(): Promise<SettleReport> {
  const report: SettleReport = { checked: 0, won: 0, lost: 0, void: 0, stillPending: 0, notFound: 0 };
  const admin = getSupabaseAdmin();
  const since = isoDay(Date.now() - (HISTORY_DAYS - 1) * 86400000);
  const { data: rows, error } = await admin.from('predictor_games').select('id,home_team,away_team,kickoff_at,selector').eq('result', 'pending').gte('game_date', since);
  if (error || !rows) return report;

  const registry = await loadTeamRegistry().catch(() => undefined);
  for (const r of rows) {
    const kickoff = r.kickoff_at ? Date.parse(r.kickoff_at) : NaN;
    if (Number.isNaN(kickoff) || Date.now() < kickoff + SETTLE_AFTER_KICKOFF_MS) { report.stillPending++; continue; }
    report.checked++;
    // the saved day lists only (filled by the score job): never a live request
    const fx = await findFixtureByTeamNames(r.home_team, r.away_team, r.kickoff_at, registry, 'apifootball').catch(() => null);
    if (!fx) { report.notFound++; report.stillPending++; continue; }

    let result: 'won' | 'lost' | 'void' | null = null;
    let finalScore: string | null = null;
    if (fx.status === 'POSTPONED' || fx.status === 'CANCELLED') {
      result = 'void';
    } else if (fx.status === 'FINISHED' && fx.fullTime && fx.fullTime.home !== null && fx.fullTime.away !== null) {
      const hit = deriveMarketFromScore({ home: fx.fullTime.home, away: fx.fullTime.away }, r.selector);
      if (hit !== null) { result = hit === 1 ? 'won' : 'lost'; finalScore = `${fx.fullTime.home}-${fx.fullTime.away}`; }
    }
    if (!result) { report.stillPending++; continue; }
    await admin.from('predictor_games').update({ result, final_score: finalScore, settled_at: new Date().toISOString() }).eq('id', r.id);
    report[result]++;
  }
  return report;
}
