// Scores one game using BOTH football data providers as a real pair, not just "one, else the other":
//   1. the provider that found the fixture is tried first (its form is built from stored history, no API requests);
//   2. if that fails or has too little form, the SAME game is looked up by team names in the other provider and
//      scored from that provider's form instead.
// Team ids differ between providers, so the second step re-matches by name (teamMatcher). Dependencies are
// injectable so this logic can be tested without any network.

import { computeMatchProbabilities, type MatchProbabilitiesData } from '@/lib/services/confidenceEngine';
import { findFixtureByTeamNames, type FixtureProvider, type MatchedFixture } from '@/lib/services/teamMatcher';
import type { TeamRegistry } from '@/lib/services/teamNameMatch';

export interface ProbDeps {
  compute: typeof computeMatchProbabilities;
  find: typeof findFixtureByTeamNames;
  configured: (p: FixtureProvider) => boolean;
}

export const realDeps: ProbDeps = {
  compute: computeMatchProbabilities,
  find: findFixtureByTeamNames,
  configured: (p) => (p === 'apifootball' ? !!process.env.API_FOOTBALL_KEY : !!process.env.FOOTBALL_DATA_API_KEY),
};

export type ProbResult =
  | { ok: true; data: MatchProbabilitiesData; usedProvider: FixtureProvider; fellBack: boolean }
  | { ok: false; reason: 'insufficient' | 'error'; message: string };

export async function probabilitiesWithFallback(
  game: { home: string; away: string; kickoff: string | null },
  primary: { provider: FixtureProvider; homeTeamId: number; awayTeamId: number },
  lines: number[],
  registry?: TeamRegistry,
  deps: ProbDeps = realDeps,
  fdBudget: { left: number } = { left: Infinity }, // football-data.org: 10 requests/min, 2 per game, so a run may only use a few
): Promise<ProbResult> {
  const mayUse = (p: FixtureProvider) => p !== 'footballdata' || fdBudget.left-- > 0;
  let lastMessage = 'no data';
  let lastReason: 'insufficient' | 'error' = 'insufficient';

  try {
    if (!mayUse(primary.provider)) throw new Error('football-data.org budget for this run is used up');
    const out = await deps.compute(primary.homeTeamId, primary.awayTeamId, lines, undefined, primary.provider, { historyOnly: true });
    if (out.status === 'ok') return { ok: true, data: out.data, usedProvider: primary.provider, fellBack: false };
    lastMessage = out.message;
  } catch (err) {
    lastReason = 'error';
    lastMessage = err instanceof Error ? err.message : String(err);
  }

  const other: FixtureProvider = primary.provider === 'apifootball' ? 'footballdata' : 'apifootball';
  if (!deps.configured(other)) return { ok: false, reason: lastReason, message: lastMessage };

  try {
    const alt: MatchedFixture | null = await deps.find(game.home, game.away, game.kickoff, registry, other);
    if (!alt) return { ok: false, reason: lastReason, message: `${lastMessage}; not found in ${other}` };
    if (!mayUse(alt.provider)) return { ok: false, reason: lastReason, message: `${lastMessage}; football-data.org budget used up` };
    const out = await deps.compute(alt.homeTeamId, alt.awayTeamId, lines, undefined, alt.provider, { historyOnly: true });
    if (out.status === 'ok') return { ok: true, data: out.data, usedProvider: alt.provider, fellBack: true };
    return { ok: false, reason: 'insufficient', message: `${lastMessage}; ${other}: ${out.message}` };
  } catch (err) {
    return { ok: false, reason: 'error', message: `${lastMessage}; ${other} failed: ${err instanceof Error ? err.message : String(err)}` };
  }
}
