// The funnel: of all the day's games, which ones are worth analysing. Free (no API calls, no AI): games that several
// tipster sites cover come first, then the rest in their original order.
//
// Speed matters: a day's API-Football list is 1,000+ games and the tipster cache another ~1,500 rows. Comparing every
// game with every row would take minutes, so each game is only compared with the rows that share at least one name
// token with it (or with a spelling the registry knows for it) -- a few dozen rows instead of thousands.

import { collectExpectations, type TipsterSourceData } from '@/lib/services/tipsterConsensus';
import { nameTokens, resolveTeam } from '@/lib/services/teamNameMatch';

type Row = { homeTeam: string; awayTeam: string };
const SOURCE_KEYS = ['statarea', 'predictz', 'vitibet', 'soccertips'] as const;
const COMMON_TOKEN_ROWS = 60; // a token on more rows than this ("united", "city", "real") says little: use the rarer ones

function tokensFor(name: string, registry: TipsterSourceData['teamRegistry']): string[] {
  const out = new Set(nameTokens(name));
  const id = registry ? resolveTeam(registry, name) : null;
  if (id) for (const v of registry!.variantsById.get(id) ?? []) for (const t of nameTokens(v)) out.add(t);
  return Array.from(out);
}

export function rankByCoverage<T extends { home: string; away: string; kickoff: string | null }>(
  games: T[],
  sources: TipsterSourceData | null,
): { game: T; sources: number }[] {
  if (!sources) return games.map((game) => ({ game, sources: 0 }));
  const registry = sources.teamRegistry;

  // token -> row numbers, per source
  const index: Record<string, Map<string, number[]>> = {};
  for (const key of SOURCE_KEYS) {
    const map = new Map<string, number[]>();
    (sources[key] as Row[]).forEach((row, i) => {
      for (const t of Array.from(new Set([...tokensFor(row.homeTeam, registry), ...tokensFor(row.awayTeam, registry)]))) {
        const list = map.get(t);
        if (list) list.push(i);
        else map.set(t, [i]);
      }
    });
    index[key] = map;
  }

  return games
    .map((game, order) => {
      const reduced: TipsterSourceData = { ...sources };
      const tokens = Array.from(new Set([...tokensFor(game.home, registry), ...tokensFor(game.away, registry)]));
      for (const key of SOURCE_KEYS) {
        const rows = sources[key] as Row[];
        const picked = new Set<number>();
        const known = tokens.filter((t) => index[key].has(t));
        const rare = known.filter((t) => index[key].get(t)!.length <= COMMON_TOKEN_ROWS);
        // rare tokens only; if every shared token is common, fall back to the least common one so the game still gets compared
        const use = rare.length ? rare : known.sort((a, b) => index[key].get(a)!.length - index[key].get(b)!.length).slice(0, 1);
        for (const t of use) for (const i of index[key].get(t) ?? []) picked.add(i);
        (reduced as any)[key] = Array.from(picked).map((i) => rows[i]);
      }
      return { game, order, sources: collectExpectations(game.home, game.away, game.kickoff, reduced).expectations.length };
    })
    .sort((a, b) => b.sources - a.sources || a.order - b.order)
    .map(({ game, sources }) => ({ game, sources }));
}
