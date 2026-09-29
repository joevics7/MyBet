// Smart Stake Calculator -- confidence-driven fractional Kelly sizing.
// Pure functions, no UI or storage concerns, so this can be reused
// unchanged from the Telegram bot once that exists.

export interface KellyInput {
  winProbability: number;   // 0-1
  decimalOdds: number;      // e.g. 1.85 (includes stake)
  bankroll: number;
  kellyFraction: number;    // 0.25 | 0.5 | 1.0 -- how aggressive
  maxStakePercent?: number; // hard ceiling as % of bankroll, default 10
}

export interface KellyResult {
  edgePercent: number;         // (p * odds - 1) * 100 -- expected value per unit staked
  fullKellyPercent: number;    // uncapped, unfractioned Kelly stake as % of bankroll
  recommendedPercent: number;  // after fraction + guardrail cap
  recommendedStake: number;    // recommendedPercent/100 * bankroll
  wasCapped: boolean;          // true if the guardrail ceiling reduced the stake
  warning: 'negative_edge' | 'low_edge' | null;
}

const DEFAULT_MAX_STAKE_PERCENT = 10; // hard ceiling regardless of what the math says
const LOW_EDGE_THRESHOLD = 0.02; // 2% -- below this, still positive but not worth much

export function calculateKellyStake(input: KellyInput): KellyResult {
  const { winProbability: p, decimalOdds: odds, bankroll, kellyFraction } = input;
  const maxStakePercent = input.maxStakePercent ?? DEFAULT_MAX_STAKE_PERCENT;

  const edge = p * odds - 1; // fraction, e.g. 0.05 = 5% edge

  // Full Kelly: f* = (p*odds - 1) / (odds - 1). Undefined/meaningless at odds <= 1.
  const fullKelly = odds > 1 ? edge / (odds - 1) : 0;
  const fullKellyNonNegative = Math.max(0, fullKelly); // never suggest a negative stake

  const fractionalPercent = fullKellyNonNegative * kellyFraction * 100;
  const recommendedPercent = Math.min(fractionalPercent, maxStakePercent);
  const wasCapped = fractionalPercent > maxStakePercent;

  let warning: KellyResult['warning'] = null;
  if (edge <= 0) warning = 'negative_edge';
  else if (edge < LOW_EDGE_THRESHOLD) warning = 'low_edge';

  return {
    edgePercent: edge * 100,
    fullKellyPercent: fullKellyNonNegative * 100,
    recommendedPercent,
    recommendedStake: (recommendedPercent / 100) * bankroll,
    wasCapped,
    warning,
  };
}

// v1 simplification: linear mapping from the Confidence Engine's 0-100
// score to a win probability. Once the Confidence Engine is built and its
// scores are validated against real outcomes, this may need recalibrating
// (e.g. compressing toward 50% at the extremes) -- but it's a reasonable
// starting point and matches how the score is described in the spec.
export function confidenceScoreToProbability(score: number): number {
  return Math.min(1, Math.max(0, score / 100));
}

export interface SelectionInput {
  odds: number;
  confidenceScore: number; // 0-100
}

// Combined odds/probability for selections placed together as one
// accumulator ticket. Assumes independence between selections (the
// standard simplification for parlay/accumulator math).
export function combineSelections(selections: SelectionInput[]): { odds: number; probability: number } {
  const odds = selections.reduce((acc, s) => acc * s.odds, 1);
  const probability = selections.reduce((acc, s) => acc * confidenceScoreToProbability(s.confidenceScore), 1);
  return { odds, probability };
}
