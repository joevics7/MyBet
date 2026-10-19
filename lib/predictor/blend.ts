// How the two kinds of evidence become ONE probability for a pick.
//
//   model   = our Poisson model built from each team's recent results (stored history / last-10 top-up)
//   tipster = the averaged expected goals of the tipster sites that cover the game (scoreConsensus.ts)
//
// The model is always the base: no form data, no pick. The tipsters adjust it, and the more sites cover the game,
// the more they count (never more than 45%):
//   0 sites -> model only        1 site -> 25%        2 sites -> 35%        3+ sites -> 45%
// Disagreement guard: if the two differ by more than 30 points, the pick is not trusted at the average; the LOWER
// of the two is used (a pick must survive both views to reach the 60 cutoff).

export const TIPSTER_WEIGHT_BY_SOURCES = [0, 0.25, 0.35, 0.45];
export const DISAGREEMENT_LIMIT = 0.3;

export function blendProbability(model: number, tipster: number | null, sources: number): { p: number; weight: number; guarded: boolean } {
  if (tipster === null || sources <= 0) return { p: model, weight: 0, guarded: false };
  if (Math.abs(model - tipster) > DISAGREEMENT_LIMIT) return { p: Math.min(model, tipster), weight: 0, guarded: true };
  const weight = TIPSTER_WEIGHT_BY_SOURCES[Math.min(sources, 3)];
  return { p: (1 - weight) * model + weight * tipster, weight, guarded: false };
}
