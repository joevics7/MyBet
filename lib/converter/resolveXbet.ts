// Finds a game on a 1xBet-style site (by team names + kickoff, same rules as the other resolvers) and turns the pick into
// that site's own ids. Supported picks: 1X2 and football Over/Under. Both-teams-to-score is not mapped on these sites yet
// (no capture shows its ids), so it is reported, never guessed.
//
// Ids: 1X2 = group 1, types 1/2/3 (seen in the captures). Totals = group 17 (seen), with Over = type 9 and Under = type 10
// (the engine's usual numbering, NOT yet confirmed by a capture), line in Param. Callers MUST read the finished code back
// and check it with xbetReadbackProblems() before showing it to anyone.

import { normalizeTeamName, similarity } from '@/lib/services/teamMatcher';
import type { EncodeSelectionInput } from '@/lib/services/sportybet';
import type { NormalizedSelection } from '@/lib/services/types';
import type { MarketSelector } from '@/lib/services/confidenceEngine';
import type { Resolution } from './resolve';
import { fetchXbetGames, type XbetGame } from './xbetFeed';

const WINDOW_MS = 2 * 3600 * 1000;
const KIND = 3; // as captured for pre-match football picks
const spec = (param: number) => `p=${param};k=${KIND}`;
const nameMatch = (a: string, b: string) => similarity(normalizeTeamName(a), normalizeTeamName(b));

function findGame(games: XbetGame[], leg: NormalizedSelection): XbetGame | null {
  const t = leg.kickoffAt ? Date.parse(leg.kickoffAt) : NaN;
  if (Number.isNaN(t)) return null;
  let best: { g: XbetGame; s: number } | null = null;
  for (const g of games) {
    if (Math.abs(g.startMs - t) > WINDOW_MS) continue;
    const hs = nameMatch(leg.homeTeam, g.home);
    const as = nameMatch(leg.awayTeam, g.away);
    if (hs < 0.7 || as < 0.7) continue;
    if (!best || hs + as > best.s) best = { g, s: hs + as };
  }
  return best?.g ?? null;
}

function pickIds(sel: MarketSelector): { marketId: string; outcomeId: string; specifier: string } | string {
  if (sel.type === '1X2') return { marketId: '1', outcomeId: sel.pick === 'home' ? '1' : sel.pick === 'draw' ? '2' : '3', specifier: spec(0) };
  if (sel.type === 'OVER_UNDER') return { marketId: '17', outcomeId: sel.pick === 'over' ? '9' : '10', specifier: spec(sel.line) };
  return 'Both-teams-to-score is not mapped on this site yet';
}

export async function resolveForXbet(site: string, legs: { leg: NormalizedSelection; selector: MarketSelector | null }[]): Promise<Resolution[]> {
  const days = new Set<string>();
  for (const { leg } of legs) if (leg.kickoffAt && !Number.isNaN(Date.parse(leg.kickoffAt))) days.add(new Date(leg.kickoffAt).toISOString().slice(0, 10));
  const byDay = new Map<string, XbetGame[]>();
  let listProblem: string | null = null;
  for (const d of Array.from(days)) {
    try { byDay.set(d, await fetchXbetGames(site, d)); } catch (err) { listProblem = err instanceof Error ? err.message : String(err); }
  }

  return legs.map(({ leg, selector }): Resolution => {
    if (!selector) return { ok: false, reason: "This market isn't supported for conversion" };
    if (!leg.kickoffAt) return { ok: false, reason: 'No kickoff time to match the game' };
    const games = byDay.get(new Date(leg.kickoffAt).toISOString().slice(0, 10));
    if (!games) return { ok: false, reason: `Couldn't read ${site}'s match list (${listProblem ?? 'unknown problem'})` };
    const game = findGame(games, leg);
    if (!game) return { ok: false, reason: `Game not found on ${site}` };
    const ids = pickIds(selector);
    if (typeof ids === 'string') return { ok: false, reason: ids };
    if (!(leg.odds > 0)) return { ok: false, reason: 'No price to start from' };
    const input: EncodeSelectionInput = { externalEventId: String(game.id), ...ids, odds: leg.odds };
    return { ok: true, input, targetOdds: null };
  });
}

// After a code is created on a 1xBet-style site: decode it and make sure every pick came back as the one we asked for.
// Returns a list of problems (empty = fine).
export function xbetReadbackProblems(
  asked: EncodeSelectionInput[],
  back: { externalEventId: string; market: string; rawOutcomeId?: string | null; rawSpecifier?: string | null }[],
): string[] {
  const problems: string[] = [];
  for (const a of asked) {
    const b = back.find((x) => x.externalEventId === a.externalEventId);
    if (!b) { problems.push(`game ${a.externalEventId} missing from the code`); continue; }
    if (b.rawOutcomeId && b.rawOutcomeId !== a.outcomeId) problems.push(`game ${a.externalEventId}: outcome came back as ${b.rawOutcomeId}, asked ${a.outcomeId}`);
    if (a.marketId === '17') {
      const line = /p=([\d.]+)/.exec(a.specifier ?? '')?.[1];
      const want = `Total Goals - ${a.outcomeId === '9' ? 'Over' : 'Under'} ${line}`;
      if (b.market !== want) problems.push(`game ${a.externalEventId}: read back as "${b.market}", asked "${want}"`);
    }
  }
  return problems;
}
