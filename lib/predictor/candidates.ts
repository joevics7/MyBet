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
import { getLiveFixtures, livePredictedIds } from '@/lib/footballApi/liveDay';
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

// Why the SportyBet set came back empty (shown in the predictor report instead of a vague 'feed unavailable')
export const bookmakerNote = { text: '' };
export const FIXTURE_WINDOW_DAYS = 0; // the predictor works on ONE date: today, or the date passed in
// What we FETCH is unchanged from before (the feed/lists/tipster pages over today + 2 days): narrowing the request itself broke
// the run (2026-11-04/05: no / 1 ticket). Only the games KEPT are limited to the one date (see onDate()).
const FETCH_AHEAD_DAYS = 2;

// The date being predicted (YYYY-MM-DD, UTC like the saved fixture lists). Anything unreadable means today.
export function targetDate(date?: string | null): string {
  return date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : new Date().toISOString().slice(0, 10);
}
// [from, to] in ms: the whole date, but never earlier than now (games already started are not predicted).
function dayBounds(date: string): { from: number; to: number } {
  return { from: Math.max(Date.now(), Date.parse(`${date}T00:00:00Z`)), to: Date.parse(`${date}T23:59:59Z`) };
}
const onDate = (iso: string | null | undefined, date: string) => !!iso && iso.slice(0, 10) === date;
export const MAX_GAMES_PER_RUN = 150; // analysed per set. Every game of the day is analysed (was 45: the 13 leagues have far fewer than 150 a day)
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
    apiFootballConfigured: true, // saved list: no API key or request needed
    footballDataConfigured: !!process.env.FOOTBALL_DATA_API_KEY,
    fixturesFrom: {}, formFrom: {}, formFallbacks: 0,
  };
}
const bump = (rec: Record<string, number>, key: string) => { rec[key] = (rec[key] ?? 0) + 1; };

async function loadSources(date: string): Promise<TipsterSourceData | null> {
  const dates = Array.from({ length: FETCH_AHEAD_DAYS + 1 }, (_, i) => new Date(Date.parse(`${date}T00:00:00Z`) + i * 86400000).toISOString().slice(0, 10));
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

async function fromBookmaker(started: number, date: string): Promise<Collected | null> {
  const bounds = dayBounds(date);
  let feed: FeedMatch[];
  try {
    // same request as before the single-date change (now .. now+2 days); the date filter below keeps one day
    feed = await fetchFamilyFeed(SPORTYBET, bounds.from, bounds.from + FETCH_AHEAD_DAYS * 86400000);
  } catch (err) {
    console.error('[predictor] SportyBet feed failed, using fallback:', err);
    bookmakerNote.text = `SportyBet feed failed: ${err instanceof Error ? err.message : String(err)}`;
    return null;
  }
  const games = feed.filter((g) => onDate(g.kickoff, date) && !LOW_SIGNAL.test(`${g.home} ${g.away} ${g.league}`));
  if (games.length === 0) { bookmakerNote.text = `No SportyBet games on ${date} (${feed.length} in the feed before the date and low-signal filters)`; return null; }

  const stats: CollectStats = {
    mode: 'bookmaker', source: SPORTYBET.label, gamesAvailable: games.length, gamesScanned: 0,
    notCovered: 0, insufficientData: 0, failed: 0, candidates: 0, budgetHit: false,
  };
  const candidates: CandidateSelection[] = [];
  const providers = (stats.providers = newProviderStats());
  const registry: TeamRegistry | undefined = await loadTeamRegistry().catch(() => undefined);
  const sources = await loadSources(date);
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
          modelSource: res.source ?? res.usedProvider,
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
  if (candidates.length === 0) bookmakerNote.text = `${games.length} SportyBet games, none usable: ${stats.insufficientData} without enough form data, ${stats.notCovered} not matched to a fixture, ${stats.failed} errors. Last problem: ${providers.lastFormProblem ?? 'none'}`;
  return candidates.length > 0 ? { candidates, stats } : null;
}

// ---- FALLBACK: fixtures only, model-implied odds -----------------------------------------------

async function fromFixtures(started: number, date: string): Promise<Collected> {
  const dateFrom = date;
  const dateTo = new Date(Date.parse(`${date}T00:00:00Z`) + FETCH_AHEAD_DAYS * 86400000).toISOString().slice(0, 10);
  // The pool: football-data.org's fixtures (the 13 leagues, which have form history) PLUS any other league's game that has an
  // API-Football prediction saved for it (the day's best 40). A game both have is kept once, from football-data.
  const providers = newProviderStats();
  const registry: TeamRegistry | undefined = await loadTeamRegistry().catch(() => undefined);
  let fdFixtures: Awaited<ReturnType<typeof fdFetchRange>> = [];
  if (providers.footballDataConfigured) {
    try { fdFixtures = await fdFetchRange(dateFrom, dateTo); } catch (err) { console.error('[predictor] football-data.org fixtures failed:', err); }
  }
  type Fx = (typeof fdFixtures)[number];
  const providerOf = new Map<number, 'footballdata' | 'apifootball'>();
  const fixtures: Fx[] = [];
  for (const f of fdFixtures) { providerOf.set(f.id, 'footballdata'); fixtures.push(f); }
  try {
    const predicted = livePredictedIds(); // this run's API-Football predictions (held in memory)
    if (predicted.size > 0) {
      const withPrediction = (await getLiveFixtures(dateFrom, dateTo)).filter((f) => predicted.has(f.id));
      for (const f of withPrediction) {
        const inFd = await findFixtureByTeamNames(f.homeTeam.name, f.awayTeam.name, f.utcDate, registry, 'footballdata').catch(() => null);
        if (inFd) continue; // football-data has it: use that (its history)
        providerOf.set(f.id + 0.5, 'apifootball'); // distinct key space from football-data ids
        fixtures.push({ ...f, id: f.id + 0.5 });
      }
    }
  } catch (err) {
    console.error('[predictor] API-Football predictions unavailable:', err);
  }
  const sources = await loadSources(date);
  const upcoming = Array.from(new Map(fixtures.map((f) => [f.id, f])).values())
    .filter((f) => onDate(f.utcDate, date) && (f.status === 'SCHEDULED' || f.status === 'TIMED') && !LOW_SIGNAL.test(`${f.homeTeam.name} ${f.awayTeam.name} ${f.competition.name}`));
  // The funnel: best-covered games first; analysis stops once MAX_GAMES_PER_RUN games are analysed.
  const rankedFixtures = rankByCoverage(upcoming.map((f) => ({ home: f.homeTeam.name, away: f.awayTeam.name, kickoff: f.utcDate, f })), sources);
  const scheduled = rankedFixtures.slice(0, MAX_GAMES_PER_RUN * 3).map((r) => r.game.f);

  const stats: CollectStats = {
    mode: 'model', source: 'football-data.org fixtures + API-Football predictions', gamesAvailable: scheduled.length,
    gamesScanned: 0, notCovered: 0, insufficientData: 0, failed: 0, candidates: 0, budgetHit: false,
    note: 'Odds are model-implied (1 / probability), not bookmaker prices.',
    providers,
    funnel: { considered: upcoming.length, analysed: 0, withTipsterCoverage: rankedFixtures.filter((r) => r.sources > 0).length },
  };
  for (const f of scheduled) bump(providers.fixturesFrom, providerOf.get(f.id) ?? 'footballdata');
  const candidates: CandidateSelection[] = [];

  stats.budgetHit = await inPool(scheduled, async (f) => {
    if (stats.funnel!.analysed >= MAX_GAMES_PER_RUN) return;
    try {
      const res = await probabilitiesWithFallback(
        { home: f.homeTeam.name, away: f.awayTeam.name, kickoff: f.utcDate },
        { provider: providerOf.get(f.id) ?? 'footballdata', homeTeamId: f.homeTeam.id, awayTeamId: f.awayTeam.id, matchId: providerOf.get(f.id) === 'apifootball' ? Math.floor(f.id) : undefined },
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
          externalEventId: String(Math.floor(f.id)),
          gameKey: `${providerOf.get(f.id) ?? 'footballdata'}:${Math.floor(f.id)}`,
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
export async function collectBookmakerCandidates(date?: string | null): Promise<Collected | null> {
  return fromBookmaker(Date.now(), targetDate(date));
}

// Model set: always built from fixtures, independent of the bookmaker feed.
export async function collectModelCandidates(date?: string | null): Promise<Collected> {
  return fromFixtures(Date.now(), targetDate(date));
}


// Which API-Football games get a prediction request: SportyBet's games (so a booking code can be made) that the 13 leagues do NOT
// cover, best tipster coverage first, up to 40. Needs this run's API-Football list to be loaded already (liveDay.ts).
export async function pickApiFootballGames(date: string): Promise<number[]> {
  const bounds = dayBounds(date);
  let feed: Awaited<ReturnType<typeof fetchFamilyFeed>> = [];
  try {
    feed = await fetchFamilyFeed(SPORTYBET, bounds.from, bounds.to);
  } catch (err) {
    console.error('[predictor] SportyBet feed failed while choosing API-Football games:', err);
    return [];
  }
  const games = feed.filter((g) => onDate(g.kickoff, date) && !LOW_SIGNAL.test(`${g.home} ${g.away} ${g.league}`));
  const sources = await loadSources(date);
  const registry: TeamRegistry | undefined = await loadTeamRegistry().catch(() => undefined);
  const ranked = rankByCoverage(games, sources);
  const ids: number[] = [];
  for (const r of ranked) {
    if (ids.length >= 40) break;
    const g = r.game;
    if (process.env.FOOTBALL_DATA_API_KEY) {
      const inFd = await findFixtureByTeamNames(g.home, g.away, g.kickoff, registry, 'footballdata').catch(() => null);
      if (inFd) continue; // a 13-league game: analysed from its own history, no request needed
    }
    const fx = await findFixtureByTeamNames(g.home, g.away, g.kickoff, registry, 'apifootball').catch(() => null);
    if (!fx || (fx.status && fx.status !== 'SCHEDULED') || ids.includes(fx.matchId)) continue;
    ids.push(fx.matchId);
  }
  return ids;
}
