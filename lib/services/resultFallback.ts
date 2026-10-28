// Vault fallback: most platforms' decode responses don't say whether a pick won. For those, we look up the
// game's final score (API-Football / football-data.org) and work the pick out ourselves.
// Covers 1X2, Over/Under and Both-teams-to-score only; anything else stays unknown (null) and the entry stays pending.
// Full-time score only. Games not finished, not found, postponed or cancelled also give null.

import type { NormalizedSelection } from './types';
import { parseMarketString } from './splitter';
import { findFixtureByTeamNames } from './teamMatcher';
import { deriveMarketFromScore } from './scoreToMarkets';

const MIN_AFTER_KICKOFF_MS = 2 * 60 * 60 * 1000; // don't even look until ~2h after kickoff

export async function winningByScore(sel: NormalizedSelection): Promise<boolean | null> {
  if (!sel.kickoffAt) return null;
  const kickoff = Date.parse(sel.kickoffAt);
  if (Number.isNaN(kickoff) || Date.now() < kickoff + MIN_AFTER_KICKOFF_MS) return null;

  const market = parseMarketString(sel.market, sel.homeTeam, sel.awayTeam);
  if (!market) return null;

  try {
    const fx = await findFixtureByTeamNames(sel.homeTeam, sel.awayTeam, sel.kickoffAt);
    if (!fx || fx.status !== 'FINISHED' || !fx.fullTime) return null;
    const { home, away } = fx.fullTime;
    if (home === null || away === null) return null;
    const r = deriveMarketFromScore({ home, away }, market);
    return r === null ? null : r === 1;
  } catch (err) {
    console.error('[resultFallback] lookup failed:', err);
    return null;
  }
}
