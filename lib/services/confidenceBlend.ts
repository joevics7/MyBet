// Blends our own Poisson-model confidence score with an external
// prediction-site signal. Purely additive module -- does NOT import from
// or modify confidenceEngine.ts / poissonModel.ts's primary path.
// computeConfidenceScoreFromNames (the existing, working path used by
// the Decoder, Splitter, and Predictor) is completely untouched; this is
// an opt-in alternative, called only where explicitly wired in.
//
// No Gemini involved here, deliberately: Statarea already publishes
// clean numeric percentages, not messy text needing extraction, so
// there's nothing for an LLM to usefully do in this particular blend.
// The averaging itself is plain arithmetic, same reasoning as before --
// deterministic code, not a language model, does the math.

import type { MarketSelector } from './confidenceEngine';
import { fetchStatareaPredictions, type StatareaPrediction } from './statarea';
import { findStatareaMatch } from './statareaMatcher';

const OWN_MODEL_WEIGHT = 0.7; // how much of the blended score comes from our own model vs. Statarea

export interface BlendedScoreResult {
  blendedScore: number;
  ownModelScore: number;
  externalScore: number | null; // null when no Statarea match was found for this fixture/market
  externalSource: 'statarea' | null;
  ownModelWeight: number;
}

// Converts a Statarea prediction's percentages into a 0-1 probability for
// the requested market. Returns null when Statarea doesn't publish that
// specific market (e.g. a line other than 1.5/2.5/3.5).
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

  // OVER_UNDER
  const overPct =
    market.line === 1.5 ? prediction.over15Percent : market.line === 2.5 ? prediction.over25Percent : market.line === 3.5 ? prediction.over35Percent : null;
  if (overPct === null) return null;
  return (market.pick === 'over' ? overPct : 100 - overPct) / 100;
}

export async function computeBlendedScore(
  homeTeam: string,
  awayTeam: string,
  kickoffAt: string | null,
  market: MarketSelector,
  ownModelScore: number, // caller already has this from computeConfidenceScoreFromNames -- not recomputed here
): Promise<BlendedScoreResult> {
  const noBlend: BlendedScoreResult = {
    blendedScore: ownModelScore,
    ownModelScore,
    externalScore: null,
    externalSource: null,
    ownModelWeight: 1,
  };

  const kickoffDate = kickoffAt ? kickoffAt.slice(0, 10) : null;

  let predictions: StatareaPrediction[];
  try {
    predictions = await fetchStatareaPredictions(kickoffDate ?? undefined);
  } catch (err) {
    console.error('[confidenceBlend] statarea fetch failed, falling back to own model only:', err);
    return noBlend;
  }

  const matched = findStatareaMatch(homeTeam, awayTeam, kickoffDate, predictions);
  if (!matched) return noBlend;

  const externalProbability = getStatareaProbability(matched, market);
  if (externalProbability === null) return noBlend;

  const externalScore = Math.round(externalProbability * 100);
  const blendedScore = Math.round(ownModelScore * OWN_MODEL_WEIGHT + externalScore * (1 - OWN_MODEL_WEIGHT));

  return {
    blendedScore,
    ownModelScore,
    externalScore,
    externalSource: 'statarea',
    ownModelWeight: OWN_MODEL_WEIGHT,
  };
}
