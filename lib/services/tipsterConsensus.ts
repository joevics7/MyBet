// OPERATING NOTES -- Confidence Score (Tipster Score part)
// - Tipster sites are fetched ONCE A DAY by /api/cron/tipster-refresh (Vercel
//   Cron, 04:00 UTC, rolling 3-day window) and stored in tipster_predictions.
//   A decode never fetches those sites itself: it reads the stored rows
//   (getCachedTipsterSources) and calculates the score from them.
// - Sources: Statarea, PredictZ, Vitibet, SoccerTips. (Forebet is NOT built:
//   forebet.ts only does a raw fetch.) Any 1 to 4 of them can contribute.
// - The score is NOT an average of per-site percentages any more. Every
//   source is turned into expected goals, those are averaged, and every market
//   is derived from that one expected scoreline (see scoreConsensus.ts).
// - BetMeter Score (our own model) is separate: it uses team form from
//   API-Football, which is cached for 6 hours.

// Tipster Consensus -- a SEPARATE, independently-shown score from our own
// Poisson model, not blended into it. Averages across whatever external
// prediction sites have a match for this fixture/market. Currently
// Statarea + Predictz; adding another site means one more entry in
// TipsterSourceData, one more fetch in fetchTipsterSources, and one more
// match block in matchTipsterConsensus.
//
// IMPORTANT: fetching and matching are deliberately SEPARATE functions.
// fetchTipsterSources() must be called ONCE per decode request (not once
// per selection) and its result reused for every selection's matching --
// calling it per-selection was a real performance bug that shipped
// briefly: each selection re-fetched both sites' entire prediction pages
// from scratch, multiplying a multi-selection slip's decode time by its
// selection count and risking a Vercel timeout on anything but a
// single-selection code.

import type { MarketSelector } from './confidenceEngine';
import type { StatareaPrediction } from './statarea';
import type { PredictzPrediction } from './predictz';
import { getCachedTipsterSources, EMPTY_TIPSTER_SOURCES, type CachedTipsterSources, type CachedScoreSource } from './tipsterCache';
import { findByNames, nameSimilarity } from './teamNameMatch';
import {
  buildConsensusMarkets,
  expectationFromScore,
  expectationFromStatarea,
  selectorProbability,
  type ConsensusMarkets,
  type SourceExpectation,
  type TipsterSourceName,
} from './scoreConsensus';
import { probabilityToScore } from './poissonModel';

export interface TipsterConsensusResult {
  score: number | null; // 0-100 for the selected market, from the averaged expected goals; null if no source matched
  sources: string[]; // which sites contributed, e.g. ['vitibet', 'predictz']
}

export type TipsterSourceData = CachedTipsterSources;

// Call ONCE per decode request (or per Predictor batch run), before
// scoring any individual selections -- pass every DISTINCT kickoff date
// present across all selections. Reads from the tipster_predictions
// CACHE (populated by the daily /api/cron/tipster-refresh job), not a
// live fetch -- that's the actual fix for the per-request ZenRows/
// Statarea cost that was happening before this cache existed. A date
// with no cached data (cron hasn't covered it yet) simply contributes
// nothing for that date, same as any other "not covered" case.
export async function fetchTipsterSources(kickoffDates: string[] = []): Promise<TipsterSourceData> {
  const uniqueDates = Array.from(new Set(kickoffDates.filter(Boolean)));
  if (uniqueDates.length === 0) return { ...EMPTY_TIPSTER_SOURCES };

  return getCachedTipsterSources(uniqueDates);
}

export interface SourceMatch {
  source: TipsterSourceName;
  theirHome: string; // how that site spells the teams, for transparency/debugging
  theirAway: string;
}

// Finds this fixture in each source and turns each hit into an expectation. No I/O.
// `fixtureId` (optional, API-Football's id) lets Vitibet be matched directly -- but ONLY when the team names
// also agree reasonably, because "Vitibet's ids are API-Football ids" is an observation, not a guarantee.
export function collectExpectations(
  homeTeam: string,
  awayTeam: string,
  kickoffAt: string | null,
  sources: TipsterSourceData,
  fixtureId?: string | number | null,
): { expectations: SourceExpectation[]; matches: SourceMatch[] } {
  const expectations: SourceExpectation[] = [];
  const matches: SourceMatch[] = [];
  const kickoffDate = kickoffAt ? kickoffAt.slice(0, 10) : null;
  const onDate = <T extends { matchDate?: string; date?: string }>(items: T[]) =>
    kickoffDate ? items.filter((i) => !(i.matchDate ?? i.date) || (i.matchDate ?? i.date) === kickoffDate) : items;

  // Statarea -> percentages, fitted to expected goals
  const sa = findByNames<StatareaPrediction>(onDate(sources.statarea), homeTeam, awayTeam)?.item;
  if (sa) {
    const e = expectationFromStatarea(sa);
    if (e) {
      expectations.push(e);
      matches.push({ source: 'statarea', theirHome: sa.homeTeam, theirAway: sa.awayTeam });
    }
  }

  // PredictZ -> predicted score
  const pz = findByNames<PredictzPrediction>(sources.predictz, homeTeam, awayTeam)?.item;
  if (pz?.predictedScore) {
    const e = expectationFromScore('predictz', pz.predictedScore.home, pz.predictedScore.away);
    if (e) {
      expectations.push(e);
      matches.push({ source: 'predictz', theirHome: pz.homeTeam, theirAway: pz.awayTeam });
    }
  }

  // Vitibet -> predicted score; fixture id first (when names agree), then names
  const vtItems = onDate(sources.vitibet);
  let vt: CachedScoreSource | undefined;
  if (fixtureId !== undefined && fixtureId !== null) {
    const byId = vtItems.find((v) => v.fixtureId === String(fixtureId));
    if (byId && nameSimilarity(homeTeam, byId.homeTeam) >= 0.4 && nameSimilarity(awayTeam, byId.awayTeam) >= 0.4) vt = byId;
  }
  vt = vt ?? findByNames<CachedScoreSource>(vtItems, homeTeam, awayTeam)?.item;
  if (vt) {
    const e = expectationFromScore('vitibet', vt.predictedScore.home, vt.predictedScore.away);
    if (e) {
      expectations.push(e);
      matches.push({ source: 'vitibet', theirHome: vt.homeTeam, theirAway: vt.awayTeam });
    }
  }

  // SoccerTips -> predicted score
  const st = findByNames<CachedScoreSource>(onDate(sources.soccertips), homeTeam, awayTeam)?.item;
  if (st) {
    const e = expectationFromScore('soccertips', st.predictedScore.home, st.predictedScore.away);
    if (e) {
      expectations.push(e);
      matches.push({ source: 'soccertips', theirHome: st.homeTeam, theirAway: st.awayTeam });
    }
  }

  return { expectations, matches };
}

// Cheap, no I/O -- matches a single selection against already-fetched
// source data. Call this once per selection; call fetchTipsterSources
// once per request, not per selection.
export function matchTipsterConsensus(
  homeTeam: string,
  awayTeam: string,
  kickoffAt: string | null,
  market: MarketSelector,
  sources: TipsterSourceData,
  fixtureId?: string | number | null,
): TipsterConsensusResult {
  const { expectations } = collectExpectations(homeTeam, awayTeam, kickoffAt, sources, fixtureId);
  const probability = selectorProbability(expectations, market);
  if (probability === null) return { score: null, sources: [] };
  return { score: probabilityToScore(probability), sources: expectations.map((e) => e.source) };
}

// All markets for one fixture (Over/Under 0.5-3.5, GG/NG, 1X2, Double Chance, Odd/Even, Home/Away team
// goals, Winning Margin, Win to Nil), from the averaged expected goals of whichever sources have the match.
export function getTipsterMarkets(
  homeTeam: string,
  awayTeam: string,
  kickoffAt: string | null,
  sources: TipsterSourceData,
  fixtureId?: string | number | null,
): { markets: ConsensusMarkets; matches: SourceMatch[] } | null {
  const { expectations, matches } = collectExpectations(homeTeam, awayTeam, kickoffAt, sources, fixtureId);
  const markets = buildConsensusMarkets(expectations);
  return markets ? { markets, matches } : null;
}
