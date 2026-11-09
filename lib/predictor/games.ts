// The day's analysed games (best suggested bet each) and their results.
//  saveAnalysedGames(): called by the predictor run. Keeps the best-scoring market per game, every game analysed, and drops
//                       rows older than 3 days (the history window).
//  settleGames():       marks each pending bet won / lost / void by checking the game's final score. Scores are fetched live and
//                       nothing from the football APIs is saved: football-data.org for 13-league games, one API-Football list per
//                       date (1 request) for the others. Games are found by exact id (game_key = provider:id).

import { getSupabaseAdmin } from '@/lib/supabase-admin';
import type { CandidateSelection } from '@/lib/services/predictorSelection';
import { deriveMarketFromScore } from '@/lib/services/scoreToMarkets';
import { fetchMatchesByDateRange as fdFetchRange, type FdMatch } from '@/lib/services/footballData';
import { fetchFixturesForDate, isApiFootballConfigured } from '@/lib/services/apiFootball';

export const HISTORY_DAYS = 3; // today + the 2 days before
const MIN_AFTER_KICKOFF_MS = 3600e3; // nothing is over before this

const isoDay = (t: number) => new Date(t).toISOString().slice(0, 10);

export async function saveAnalysedGames(date: string, candidates: CandidateSelection[]): Promise<{ saved: number; error?: string }> {
  // best market per game; a game with a SportyBet id can get a booking code, one without is still listed (marked not bookable)
  const best = new Map<string, CandidateSelection>();
  for (const c of candidates) {
    if (!c.gameKey || !c.selector) continue;
    const cur = best.get(c.gameKey);
    const better = !cur || (c.externalEventId.startsWith('sr:match:') && !cur.externalEventId.startsWith('sr:match:')) || (c.externalEventId.startsWith('sr:match:') === cur.externalEventId.startsWith('sr:match:') && c.score > cur.score);
    if (better) best.set(c.gameKey, c);
  }
  const rows = Array.from(best.values())
    .sort((a, b) => b.score - a.score)
    .map((c) => ({
      game_date: date,
      game_key: c.gameKey!,
      external_event_id: c.externalEventId.startsWith('sr:match:') ? c.externalEventId : '',
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
  await admin.from('predictor_games').delete().lt('game_date', isoDay(Date.parse(`${date}T00:00:00Z`) - (HISTORY_DAYS - 1) * 86400000));
  if (rows.length === 0) return { saved: 0 };
  // a re-run must not wipe a result that is already marked
  const { error } = await admin.from('predictor_games').upsert(rows, { onConflict: 'game_date,game_key', ignoreDuplicates: true });
  return error ? { saved: 0, error: error.message } : { saved: rows.length };
}

export interface SettleReport { pending: number; won: number; lost: number; void: number; stillWaiting: number; notFound: number }

export async function settleGames(): Promise<SettleReport> {
  const report: SettleReport = { pending: 0, won: 0, lost: 0, void: 0, stillWaiting: 0, notFound: 0 };
  const admin = getSupabaseAdmin();
  const since = isoDay(Date.now() - (HISTORY_DAYS - 1) * 86400000);
  const { data: rows } = await admin.from('predictor_games').select('id,game_key,kickoff_at,selector').eq('result', 'pending').gte('game_date', since);
  const due = (rows ?? []).filter((r) => r.kickoff_at && Date.now() >= Date.parse(r.kickoff_at) + MIN_AFTER_KICKOFF_MS);
  report.pending = (rows ?? []).length;
  report.stillWaiting = report.pending - due.length;
  if (due.length === 0) return report;

  // one fetch per source per date: football-data.org (13 leagues) and API-Football (1 request per date, only if needed)
  const days = (provider: string) => Array.from(new Set(due.filter((r) => r.game_key.startsWith(`${provider}:`)).map((r) => isoDay(Date.parse(r.kickoff_at!)))));
  const byId = new Map<string, FdMatch>();
  if (process.env.FOOTBALL_DATA_API_KEY) {
    for (const d of days('footballdata')) {
      try { (await fdFetchRange(d, d)).forEach((m) => byId.set(`footballdata:${m.id}`, m)); } catch (err) { console.error('[settle] football-data failed for', d, err); }
    }
  }
  if (isApiFootballConfigured()) {
    for (const d of days('apifootball')) {
      try { (await fetchFixturesForDate(d)).forEach((m) => byId.set(`apifootball:${m.id}`, m)); } catch (err) { console.error('[settle] API-Football failed for', d, err); }
    }
  }

  for (const r of due) {
    const m = byId.get(r.game_key);
    if (!m) { report.notFound++; report.stillWaiting++; continue; }
    let result: 'won' | 'lost' | 'void' | null = null;
    let finalScore: string | null = null;
    if (m.status === 'POSTPONED' || m.status === 'CANCELLED') {
      result = 'void';
    } else if (m.status === 'FINISHED' && m.score.fullTime.home !== null && m.score.fullTime.away !== null) {
      const hit = deriveMarketFromScore({ home: m.score.fullTime.home, away: m.score.fullTime.away }, r.selector);
      if (hit !== null) { result = hit === 1 ? 'won' : 'lost'; finalScore = `${m.score.fullTime.home}-${m.score.fullTime.away}`; }
    }
    if (!result) { report.stillWaiting++; continue; }
    await admin.from('predictor_games').update({ result, final_score: finalScore, settled_at: new Date().toISOString() }).eq('id', r.id);
    report[result]++;
  }
  return report;
}
