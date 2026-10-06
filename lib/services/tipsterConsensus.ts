// Tipster Consensus -- a SEPARATE, independently-shown score from our own
// Poisson model, not blended into it. Averages across whatever external
// prediction sites have a match for this fixture/market. Currently just
// Statarea; adding another site later means adding one more try/catch
// block below that pushes into `scores` -- the averaging and the
// Decoder UI don't need to change.

import type { MarketSelector } from './confidenceEngine';
import { fetchStatareaPredictions, type StatareaPrediction } from './statarea';
import { findStatareaMatch } from './statareaMatcher';
import { fetchPredictzPredictions } from './predictz';
import { findPredictzMatch } from './predictzMatcher';
import { deriveMarketFromScore } from './scoreToMarkets';

export interface TipsterConsensusResult {
  score: number | null; // 0-100, averaged across matched sources; null if none matched
  sources: string[]; // which sites contributed, e.g. ['statarea']
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

export async function computeTipsterConsensus(
  homeTeam: string,
  awayTeam: string,
  kickoffAt: string | null,
  market: MarketSelector,
): Promise<TipsterConsensusResult> {
  const scores: { source: string; score: number }[] = [];
  const kickoffDate = kickoffAt ? kickoffAt.slice(0, 10) : null;

  try {
    const predictions = await fetchStatareaPredictions(kickoffDate ?? undefined);
    const matched = findStatareaMatch(homeTeam, awayTeam, kickoffDate, predictions);
    if (matched) {
      const probability = getStatareaProbability(matched, market);
      if (probability !== null) scores.push({ source: 'statarea', score: Math.round(probability * 100) });
    }
  } catch (err) {
    console.error('[tipsterConsensus] statarea failed:', err);
  }

  try {
    const predictions = await fetchPredictzPredictions();
    const matched = findPredictzMatch(homeTeam, awayTeam, predictions);
    if (matched?.predictedScore) {
      const derived = deriveMarketFromScore(matched.predictedScore, market);
      // derived is 0 or 1 (a single predicted score, not a percentage --
      // see scoreToMarkets.ts) -- averaged in equally alongside Statarea's
      // real percentage for now. Cruder signal, same weight; worth
      // revisiting once we see how it performs.
      if (derived !== null) scores.push({ source: 'predictz', score: derived * 100 });
    }
  } catch (err) {
    console.error('[tipsterConsensus] predictz failed:', err);
  }

  // Next prediction site goes here: its own try/catch, push into `scores`
  // the same way. Averaging below handles any number of sources.

  if (scores.length === 0) return { score: null, sources: [] };

  const avg = Math.round(scores.reduce((sum, s) => sum + s.score, 0) / scores.length);
  return { score: avg, sources: scores.map((s) => s.source) };
}
