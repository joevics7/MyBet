// Derives market outcomes from a single predicted scoreline (e.g. "2-1").
// For sources that only publish a best-guess correct score (not a full
// probability breakdown like Statarea's), this lets one data point
// answer 1X2, BTTS, and Over/Under questions, instead of needing
// separate extraction logic per market per site.
//
// IMPORTANT LIMITATION: a predicted scoreline is one best guess, not a
// probability distribution -- it can't tell us HOW confident the source
// is, just what they think will happen. The value returned here is
// deliberately binary (0 or 1), not a percentage: treating "predicted
// 2-1" as "100% confident in a home win" would overstate it. When this
// gets folded into Tipster Score's average alongside a source like
// Statarea that gives real percentages, it's a cruder signal -- worth
// remembering when interpreting results, not something to hide.

import type { MarketSelector } from './confidenceEngine';

export interface PredictedScore {
  home: number;
  away: number;
}

export function deriveMarketFromScore(score: PredictedScore, market: MarketSelector): number | null {
  if (market.type === '1X2') {
    const outcome = score.home > score.away ? 'home' : score.home < score.away ? 'away' : 'draw';
    return market.pick === outcome ? 1 : 0;
  }

  if (market.type === 'BTTS') {
    const bothScored = score.home > 0 && score.away > 0;
    return (market.pick === 'yes') === bothScored ? 1 : 0;
  }

  if (market.type === 'OVER_UNDER') {
    const total = score.home + score.away;
    const isOver = total > market.line;
    return (market.pick === 'over') === isOver ? 1 : 0;
  }

  return null;
}
