// The funnel: of all the day's games, which ones are worth analysing. Pure and free (no API calls, no AI): games that
// several tipster sites cover come first (more evidence to blend), then the rest in their original order.

import { collectExpectations, type TipsterSourceData } from '@/lib/services/tipsterConsensus';

export function rankByCoverage<T extends { home: string; away: string; kickoff: string | null }>(
  games: T[],
  sources: TipsterSourceData | null,
): { game: T; sources: number }[] {
  return games
    .map((game, order) => ({
      game,
      order,
      sources: sources ? collectExpectations(game.home, game.away, game.kickoff, sources).expectations.length : 0,
    }))
    .sort((a, b) => b.sources - a.sources || a.order - b.order)
    .map(({ game, sources }) => ({ game, sources }));
}
