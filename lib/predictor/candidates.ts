// Collects the Predictor's candidate selections.
//
// Two independent sets, shown as two tabs on the page (different games, different odds):
//  BOOKMAKER set: the day's games from SportyBet's feed (real games + REAL odds).
//            Each game is matched to a fixture in our football data
//            (API-Football first, football-data.org as fallback -- the same
//            matcher the Decoder's confidence score uses), scored by the same
//            engine, and every priced market becomes a candidate.
//  MODEL set: fixtures from our football data (any league it covers, whether or
//            not SportyBet lists them), priced with model-implied odds (1/probability).

import { fetchFamilyFeed, SPORTYBET } from '@/lib/odds/sportybetFeed';
import type { FeedMatch } from '@/lib/odds/types';
import { findFixtureByTeamNames } from '@/lib/services/teamMatcher';
import { fetchMatchesByDateRange as fdFetchRange } from '@/lib/services/footballData';
import { fetchMatchesByDateRange as afFetchRange, isApiFootballConfigured } from '@/lib/services/apiFootball';
import { scoreForMarket, type MarketSelector } from '@/lib/services/confidenceEngine';
import { probabilitiesWithFallback } from './probabilities';
import { loadTeamRegistry } from '@/lib/services/teamRegistry';
import { fetchTipsterSources, collectExpectations, type TipsterSourceData } from '@/lib/services/tipsterConsensus';
import { selectorProbability } from '@/lib/services/scoreConsensus';
import { blendProbability } from './blend';
import { rankByCoverage } from './shortlist';
import { probabilityToScore } from '@/lib/services/poissonModel';
import type { TeamRegistry } from '@/lib/services/teamNameMatch';
import type { CandidateSelection } from '@/lib/services/predictorSelection';

export const FIXTURE_WINDOW_DAYS = 2;
export const MAX_GAMES_PER_RUN = 45; // analysed per set: the funnel (shortlist.ts) picks the 45 best-covered games of the day
const CONCURRENCY = 4;
const SCAN_BUDGET_MS = 25000; // both sets scan in parallel; leaves the rest of the 60s for analysis, saving and codes
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// The markets scanned for every game. One form fetch per team covers all of them.
export const CANDIDATE_MARKETS: MarketSelector[] = [
  { type: '1X2', pick: 'home' },
  { type: '1X2', pick: 'draw' },
  { type: '1X2', pick: 'away' },
  { type: 'BTTS', pick: 'yes' },
  { type: 'BTTS', pick: 'no' },
  { type: 'OVER_UNDER', pick: 'over', line: 1.5 },
  { type: 'OVER_UNDER', pick: 'over', line: 2.5 },
  { type: 'OVER_UNDER', pick: 'under', line: 2.5 }, // scanned for completeness; Under picks are never published (predictorSelection)
];
const MODEL_LINES = [1.5, 2.5];

export function marketLabelFor(m: MarketSelector): string {
  return m.type === '1X2' ? `1X2 - ${m.pick}` : m.type === 'BTTS' ? `BTTS - ${m.pick === 'yes' ? 'Yes' : 'No'}` : `${m.pick === 'over' ? 'Over' : 'Under'} ${m.line}`;
}

// 1/probability, capped so a near-zero probability can't produce Infinity (the database rejects it).
const safeOdds = (p: number) => (p > 0.001 ? Math.round((1 / p) * 100) / 100 : 999);

// Real price for a market from a feed match's odds, if the bookmaker has it.
export function bookPrice(odds: FeedMatch['odds'], m: MarketSelector): number | null {
  if (m.type === '1X2') return odds['1x2']?.[{ home: 0, draw: 1, away: 2 }[m.pick]] ?? null;
  if (m.type === 'BTTS') return odds.btts?.[m.pick === 'yes' ? 0 : 1] ?? null;
  const key = `ou${m.line}` as 'ou1.5' | 'ou2.5' | 'ou3.5';
  return odds[key]?.[m.pick === 'over' ? 0 : 1] ?? null;
}

// Youth/women/reserve sides have thin, unreliable form data: skip them.
export const LOW_SIGNAL = /\b(u-?\d{2}|women|ladies|reserves?|youth|\(w\))\b|\bii\b/i;

export interface CollectStats {
  mode: 'bookmaker' | 'model';
  source: string;
  gamesAvailable: number;
  gamesScanned: number;
  notCovered: number;
  insufficientData: number;
  failed: number;
  candidates: number;
  budgetHit: boolean;
  funnel?: { considered: number; analysed: number; withTipsterCoverage: number };
  providers?: { apiFootballConfigured: boolean; footballDataConfigured: boolean; fixturesFrom: Record<string, number>; formFrom: Record<string, number>; formFallbacks: number; lastFormProblem?: string };
  note?: string;
}

export interface Collected {
  candidates: CandidateSelection[];
  stats: CollectStats;
}

function newProviderStats(): NonNullable<CollectStats['providers']> {
  return {
    apiFootballConfigured: isApiFootballConfigured(),
    footballDataConfigured: !!process.env.FOOTBALL_DATA_API_KEY,
    fixturesFrom: {}, formFrom: {}, formFallbacks: 0,
  };
}
const bump = (rec: Record<string, number>, key: string) => { rec[key] = (rec[key] ?? 0) + 1; };

async function loadSources(): Promise<TipsterSourceData | null> {
  const dates = Array.from({ length: FIXTURE_WINDOW_DAYS + 1 }, (_, i) => new Date(Date.now() + i * 86400000).toISOString().slice(0, 10));
  return fetchTipsterSources(dates).catch((err) => {
    console.error('[predictor] tipster sources unavailable, using the model alone:', err);
    return null;
  });
}

// One probability per market: the model, adjusted by the tipster sites that cover this game (blend.ts).
function blendedScore(model: number, expectations: ReturnType<typeof collectExpectations>['expectations'], market: MarketSelector) {
  const tipster = expectations.length ? selectorProbability(expectations, market) : null;
  const { p } = blendProbability(model, tipster, expectations.length);
  return { probability: p, score: probabilityToScore(p) };
}

async function inPool<T>(items: T[], worker: (item: T) => Promise<void>, deadline: number): Promise<boolean> {
  let next = 0;
  let hit = false;
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, items.length) }, async () => {
      while (next < items.length) {
        if (Date.now() > deadline) {
          hit = true;
          return;
        }
        await worker(items[next++]);
      }
    }),
  );
  return hit;
}

// ---- MAIN: SportyBet games with real odds ------------------------------------------------

async function fromBookmaker(started: number): Promise<Collected | null> {
  const now = Date.now();
  let feed: FeedMatch[];
  try {
    feed = await fetchFamilyFeed(SPORTYBET, now, now + FIXTURE_WINDOW_DAYS * 86400000);
  } catch (err) {
    console.error('[predictor] SportyBet feed failed, using fallback:', err);
    return null;
  }
  const games = feed.filter((g) => !LOW_SIGNAL.test(`${g.home} ${g.away} ${g.league}`));
  if (games.length === 0) return null;

  const stats: CollectStats = {
    mode: 'bookmaker', source: SPORTYBET.label, gamesAvailable: games.length, gamesScanned: 0,
    notCovered: 0, insufficientData: 0, failed: 0, candidates: 0, budgetHit: false,
  };
  const candidates: CandidateSelection[] = [];
  const providers = (stats.providers = newProviderStats());
  const registry: TeamRegistry | undefined = await loadTeamRegistry().catch(() => undefined);
  const sources = await loadSources();
  // The funnel: games covered by the most tipster sites first; analysis stops once MAX_GAMES_PER_RUN games are analysed.
  const ranked = rankByCoverage(games.map((g) => ({ ...g, kickoff: g.kickoff })), sources);
  stats.funnel = { considered: games.length, analysed: 0, withTipsterCoverage: ranked.filter((r) => r.sources > 0).length };

  stats.budgetHit = await inPool(ranked.slice(0, MAX_GAMES_PER_RUN * 3).map((r) => r.game), async (g) => {
    if (stats.funnel!.analysed >= MAX_GAMES_PER_RUN) return;
    try {
      const fixture = await findFixtureByTeamNames(g.home, g.away, g.kickoff, registry);
      if (!fixture) return void stats.notCovered++;
      stats.gamesScanned++;
      bump(providers.fixturesFrom, fixture.provider);
      const res = await probabilitiesWithFallback(g, fixture, MODEL_LINES, registry);
      if (!res.ok) {
        providers.lastFormProblem = res.message;
        return void (res.reason === 'error' ? stats.failed++ : stats.insufficientData++);
      }
      bump(providers.formFrom, res.usedProvider);
      if (res.fellBack) providers.formFallbacks++;
      stats.funnel!.analysed++;
      const out = { data: res.data };
      const expectations = sources ? collectExpectations(g.home, g.away, g.kickoff, sources).expectations : [];

      const form = { home: out.data.homeFormString, away: out.data.awayFormString, homeGoalsAvg: out.data.homeGoalsAvg, awayGoalsAvg: out.data.awayGoalsAvg };
      for (const market of CANDIDATE_MARKETS) {
        const base = scoreForMarket(market, out.data.probs);
        const scored = base ? blendedScore(base.probability, expectations, market) : null;
        const odds = bookPrice(g.odds, market);
        if (!scored || odds === null) continue;
        candidates.push({
          externalEventId: g.srId ?? `${g.home}|${g.away}|${g.kickoff}`,
          gameKey: `${fixture.provider}:${fixture.matchId}`,
          homeTeam: g.home,
          awayTeam: g.away,
          competition: g.league,
          market: marketLabelFor(market),
          score: scored.score,
          modelOdds: safeOdds(scored.probability),
          probability: scored.probability,
          odds,
          oddsSource: 'bookmaker',
          selector: market,
          bookName: SPORTYBET.label,
          form,
          reason: '',
          kickoffAt: g.kickoff,
        });
      }
    } catch (err) {
      console.error('[predictor] game failed, skipping:', g.home, g.away, err);
      stats.failed++;
    }
  }, started + SCAN_BUDGET_MS);

  stats.candidates = candidates.length;
  return candidates.length > 0 ? { candidates, stats } : null;
}

// ---- FALLBACK: fixtures only, model-implied odds -----------------------------------------------

async function fromFixtures(started: number): Promise<Collected> {
  const dateFrom = new Date().toISOString().slice(0, 10);
  const dateTo = new Date(Date.now() + FIXTURE_WINDOW_DAYS * 86400000).toISOString().slice(0, 10);
  // Both providers, in order: API-Football (wide coverage) first; football-data.org if it fails, is out of quota or returns nothing.
  const providers = newProviderStats();
  let useAf = false;
  let fixtures: Awaited<ReturnType<typeof afFetchRange>> = [];
  if (providers.apiFootballConfigured) {
    try {
      fixtures = await afFetchRange(dateFrom, dateTo);
      useAf = fixtures.length > 0;
    } catch (err) {
      console.error('[predictor] API-Football fixtures failed, trying football-data.org:', err);
    }
  }
  if (!useAf && providers.footballDataConfigured) fixtures = await fdFetchRange(dateFrom, dateTo);
  const registry: TeamRegistry | undefined = await loadTeamRegistry().catch(() => undefined);
  const sources = await loadSources();
  const upcoming = Array.from(new Map(fixtures.map((f) => [f.id, f])).values())
    .filter((f) => (f.status === 'SCHEDULED' || f.status === 'TIMED') && !LOW_SIGNAL.test(`${f.homeTeam.name} ${f.awayTeam.name} ${f.competition.name}`));
  // The funnel: best-covered games first; analysis stops once MAX_GAMES_PER_RUN games are analysed.
  const rankedFixtures = rankByCoverage(upcoming.map((f) => ({ home: f.homeTeam.name, away: f.awayTeam.name, kickoff: f.utcDate, f })), sources);
  const scheduled = rankedFixtures.slice(0, MAX_GAMES_PER_RUN * 3).map((r) => r.game.f);

  const stats: CollectStats = {
    mode: 'model', source: useAf ? 'API-Football fixtures' : 'football-data.org fixtures', gamesAvailable: scheduled.length,
    gamesScanned: 0, notCovered: 0, insufficientData: 0, failed: 0, candidates: 0, budgetHit: false,
    note: 'Odds are model-implied (1 / probability), not bookmaker prices.',
    providers,
    funnel: { considered: upcoming.length, analysed: 0, withTipsterCoverage: rankedFixtures.filter((r) => r.sources > 0).length },
  };
  providers.fixturesFrom[useAf ? 'apifootball' : 'footballdata'] = scheduled.length;
  const candidates: CandidateSelection[] = [];

  stats.budgetHit = await inPool(scheduled, async (f) => {
    if (stats.funnel!.analysed >= MAX_GAMES_PER_RUN) return;
    try {
      const res = await probabilitiesWithFallback(
        { home: f.homeTeam.name, away: f.awayTeam.name, kickoff: f.utcDate },
        { provider: useAf ? 'apifootball' : 'footballdata', homeTeamId: f.homeTeam.id, awayTeamId: f.awayTeam.id },
        MODEL_LINES, registry,
      );
      if (!res.ok) {
        providers.lastFormProblem = res.message;
        return void (res.reason === 'error' ? stats.failed++ : stats.insufficientData++);
      }
      stats.gamesScanned++;
      stats.funnel!.analysed++;
      bump(providers.formFrom, res.usedProvider);
      if (res.fellBack) providers.formFallbacks++;
      const out = { data: res.data };
      const expectations = sources ? collectExpectations(f.homeTeam.name, f.awayTeam.name, f.utcDate, sources).expectations : [];
      const form = { home: out.data.homeFormString, away: out.data.awayFormString, homeGoalsAvg: out.data.homeGoalsAvg, awayGoalsAvg: out.data.awayGoalsAvg };
      for (const market of CANDIDATE_MARKETS) {
        const base = scoreForMarket(market, out.data.probs);
        if (!base) continue;
        const scored = blendedScore(base.probability, expectations, market);
        const modelOdds = safeOdds(scored.probability);
        candidates.push({
          externalEventId: String(f.id),
          gameKey: `${useAf ? 'apifootball' : 'footballdata'}:${f.id}`,
          homeTeam: f.homeTeam.name,
          awayTeam: f.awayTeam.name,
          competition: f.competition.name,
          market: marketLabelFor(market),
          score: scored.score,
          modelOdds,
          probability: scored.probability,
          odds: modelOdds,
          oddsSource: 'model',
          selector: market,
          form,
          reason: '',
          kickoffAt: f.utcDate,
        });
      }
    } catch (err) {
      console.error('[predictor] fixture failed, skipping:', f.id, err);
      stats.failed++;
      await sleep(100);
    }
  }, started + SCAN_BUDGET_MS);

  stats.candidates = candidates.length;
  return { candidates, stats };
}

// Bookmaker set: null when SportyBet's feed is unavailable (the tab then shows nothing today).
export async function collectBookmakerCandidates(): Promise<Collected | null> {
  return fromBookmaker(Date.now());
}

// Model set: always built from fixtures, independent of the bookmaker feed.
export async function collectModelCandidates(): Promise<Collected> {
  return fromFixtures(Date.now());
}
