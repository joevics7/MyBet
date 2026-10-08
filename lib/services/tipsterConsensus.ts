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
import { fetchStatareaPredictions, type StatareaPrediction } from './statarea';
import { findStatareaMatch } from './statareaMatcher';
import { fetchPredictzPredictions, type PredictzPrediction } from './predictz';
import { findPredictzMatch } from './predictzMatcher';
import { deriveMarketFromScore } from './scoreToMarkets';

export interface TipsterConsensusResult {
  score: number | null; // 0-100, averaged across matched sources; null if none matched
  sources: string[]; // which sites contributed, e.g. ['statarea']
}

export interface TipsterSourceData {
  statarea: StatareaPrediction[];
  predictz: PredictzPrediction[];
}

// Call ONCE per decode request (or per Predictor batch run), before
// scoring any individual selections -- pass every DISTINCT kickoff date
// present across all selections, not just one. A slip spanning multiple
// days (common) needs Statarea fetched once per distinct date; scoping
// to only the first selection's date silently loses matches for every
// other date -- that happened in production and is what this fixes.
// Still cheap: bounded by distinct dates in the slip (typically 1-4),
// not by selection count. Each fetch is independently fault-tolerant.
//
// Predictz only has 3 fetchable windows (today / tomorrow / a specific
// later date), not arbitrary per-date fetches like Statarea -- daysAhead
// (0, 1, or 2) controls how far out to also check, independent of the
// exact kickoffDates passed.
export async function fetchTipsterSources(kickoffDates: string[] = [], predictzDaysAhead: number[] = [0]): Promise<TipsterSourceData> {
  const uniqueDates = Array.from(new Set(kickoffDates.filter(Boolean)));
  const datesToFetch = uniqueDates.length > 0 ? uniqueDates : [undefined]; // undefined = Statarea's own "today" default
  const uniqueDaysAhead = Array.from(new Set(predictzDaysAhead));

  const [statareaSettled, predictzSettled] = await Promise.all([
    Promise.allSettled(datesToFetch.map((d) => fetchStatareaPredictions(d))),
    Promise.allSettled(uniqueDaysAhead.map((d) => fetchPredictzPredictions(d))),
  ]);

  const statarea = statareaSettled.flatMap((r) => (r.status === 'fulfilled' ? r.value : []));
  const predictz = predictzSettled.flatMap((r) => (r.status === 'fulfilled' ? r.value : []));

  return { statarea, predictz };
}

function getStatareaProbability(prediction: StatareaPrediction, market: MarketSelector): number | null {
  if (market.type === '1X2') {
    const pct =
      market.pick === 'home'
        ? prediction.homeWinPercent
        : market.pick === 'draw'
          ? prediction.drawPercent
          : prediction.awayWinPercent;
    return pct / 100;
  }
  if (market.type === 'BTTS') {
    return (market.pick === 'yes' ? prediction.bttsYesPercent : prediction.bttsNoPercent) / 100;
  }
  const overPct =
    market.line === 1.5
      ? prediction.over15Percent
      : market.line === 2.5
        ? prediction.over25Percent
        : market.line === 3.5
          ? prediction.over35Percent
          : null;
  if (overPct === null) return null;
  return (market.pick === 'over' ? overPct : 100 - overPct) / 100;
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
): TipsterConsensusResult {
  const scores: { source: string; score: number }[] = [];
  const kickoffDate = kickoffAt ? kickoffAt.slice(0, 10) : null;

  const statareaMatch = findStatareaMatch(homeTeam, awayTeam, kickoffDate, sources.statarea);
  if (statareaMatch) {
    const probability = getStatareaProbability(statareaMatch, market);
    if (probability !== null) scores.push({ source: 'statarea', score: Math.round(probability * 100) });
  }

  const predictzMatch = findPredictzMatch(homeTeam, awayTeam, sources.predictz);
  if (predictzMatch) {
    // Prefer real decimal-odds-implied probability for 1X2 (continuous,
    // richer signal) when Predictz gave odds; this is the one market it
    // publishes odds for. Falls back to the derived-score 0/1 signal for
    // BTTS/Over-Under (no odds given for those) or if 1X2 odds are missing.
    if (market.type === '1X2' && predictzMatch.oddsHome && predictzMatch.oddsDraw && predictzMatch.oddsAway) {
      const odds =
        market.pick === 'home' ? predictzMatch.oddsHome : market.pick === 'draw' ? predictzMatch.oddsDraw : predictzMatch.oddsAway;
      if (odds > 0) {
        // Decimal-odds implied probability (1/odds) includes the
        // bookmaker's margin and isn't normalized across all three
        // outcomes -- a rough signal, not a true probability, but still
        // meaningfully richer than a binary derived guess.
        scores.push({ source: 'predictz', score: Math.round((1 / odds) * 100) });
      }
    } else if (predictzMatch.predictedScore) {
      const derived = deriveMarketFromScore(predictzMatch.predictedScore, market);
      if (derived !== null) scores.push({ source: 'predictz', score: derived * 100 });
    }
  }

  if (scores.length === 0) return { score: null, sources: [] };

  const avg = Math.round(scores.reduce((sum, s) => sum + s.score, 0) / scores.length);
  return { score: avg, sources: scores.map((s) => s.source) };
}
