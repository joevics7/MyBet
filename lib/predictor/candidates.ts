// Collects the Predictor's candidate selections.
//
//  MAIN:     the day's games from SportyBet's feed (real games + REAL odds).
//            Each game is matched to a fixture in our football data
//            (API-Football first, football-data.org as fallback -- the same
//            matcher the Decoder's confidence score uses), scored by the same
//            engine, and every priced market becomes a candidate.
//  FALLBACK: if SportyBet's feed fails or returns nothing, scan fixtures from
//            our football data and price them with model-implied odds.

import { fetchFamilyFeed, SPORTYBET } from '@/lib/odds/sportybetFeed';
import type { FeedMatch } from '@/lib/odds/types';
import { findFixtureByTeamNames, type FixtureProvider } from '@/lib/services/teamMatcher';
import { fetchMatchesByDateRange as fdFetchRange } from '@/lib/services/footballData';
import { fetchMatchesByDateRange as afFetchRange, isApiFootballConfigured } from '@/lib/services/apiFootball';
import { computeMatchProbabilities, scoreForMarket, type MarketSelector } from '@/lib/services/confidenceEngine';
import type { CandidateSelection } from '@/lib/services/predictorSelection';

export const FIXTURE_WINDOW_DAYS = 2;
export const MAX_GAMES_PER_RUN = 60;
const CONCURRENCY = 4;
const SCAN_BUDGET_MS = 32000; // leave the rest of the 60s for analysis text + saving
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// The markets scanned for every game. One form fetch per team covers all of them.
export const CANDIDATE_MARKETS: MarketSelector[] = [
  { type: '1X2', pick: 'home' },
  { type: '1X2', pick: 'draw' },
  { type: '1X2', pick: 'away' },
  { type: 'BTTS', pick: 'yes' },
  { type: 'OVER_UNDER', pick: 'over', line: 2.5 },
  { type: 'OVER_UNDER', pick: 'under', line: 2.5 },
];

export function marketLabelFor(m: MarketSelector): string {
  return m.type === '1X2' ? `1X2 - ${m.pick}` : m.type === 'BTTS' ? 'BTTS - Yes' : `${m.pick === 'over' ? 'Over' : 'Under'} ${m.line}`;
}

// 1/probability, capped so a near-zero probability can't produce Infinity (the database rejects it).
const safeOdds = (p: number) => (p > 0.001 ? Math.round((1 / p) * 100) / 100 : 999);

// Real price for a market from a feed match's odds, if the bookmaker has it.
export function bookPrice(odds: FeedMatch['odds'], m: MarketSelector): number | null {
  if (m.type === '1X2') return odds['1x2']?.[{ home: 0, draw: 1, away: 2 }[m.pick]] ?? null;
  if (m.type === 'BTTS') return odds.btts?.[0] ?? null;
  return odds['ou2.5']?.[m.pick === 'over' ? 0 : 1] ?? null;
}

// Youth/women/reserve sides have thin, unreliable form data: skip them.
const LOW_SIGNAL = /\b(u-?\d{2}|women|ladies|reserves?|youth|\(w\))\b|\bii\b/i;

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
  note?: string;
}

export interface Collected {
  candidates: CandidateSelection[];
  stats: CollectStats;
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

  stats.budgetHit = await inPool(games.slice(0, MAX_GAMES_PER_RUN * 2), async (g) => {
    if (stats.gamesScanned >= MAX_GAMES_PER_RUN) return;
    try {
      const fixture = await findFixtureByTeamNames(g.home, g.away, g.kickoff);
      if (!fixture) return void stats.notCovered++;
      stats.gamesScanned++;
      const out = await computeMatchProbabilities(fixture.homeTeamId, fixture.awayTeamId, [2.5], undefined, fixture.provider as FixtureProvider);
      if (out.status !== 'ok') return void stats.insufficientData++;

      const form = { home: out.data.homeFormString, away: out.data.awayFormString, homeGoalsAvg: out.data.homeGoalsAvg, awayGoalsAvg: out.data.awayGoalsAvg };
      for (const market of CANDIDATE_MARKETS) {
        const scored = scoreForMarket(market, out.data.probs);
        const odds = bookPrice(g.odds, market);
        if (!scored || odds === null) continue;
        candidates.push({
          externalEventId: g.srId ?? `${g.home}|${g.away}|${g.kickoff}`,
          homeTeam: g.home,
          awayTeam: g.away,
          competition: g.league,
          market: marketLabelFor(market),
          score: scored.score,
          modelOdds: safeOdds(scored.probability),
          probability: scored.probability,
          odds,
          oddsSource: 'bookmaker',
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
  const useAf = isApiFootballConfigured();
  const fixtures = await (useAf ? afFetchRange : fdFetchRange)(dateFrom, dateTo);
  const scheduled = fixtures
    .filter((f) => (f.status === 'SCHEDULED' || f.status === 'TIMED') && !LOW_SIGNAL.test(`${f.homeTeam.name} ${f.awayTeam.name} ${f.competition.name}`))
    .slice(0, MAX_GAMES_PER_RUN);

  const stats: CollectStats = {
    mode: 'model', source: useAf ? 'API-Football fixtures' : 'football-data.org fixtures', gamesAvailable: scheduled.length,
    gamesScanned: 0, notCovered: 0, insufficientData: 0, failed: 0, candidates: 0, budgetHit: false,
    note: 'Bookmaker feed unavailable: odds are model-implied.',
  };
  const candidates: CandidateSelection[] = [];

  stats.budgetHit = await inPool(scheduled, async (f) => {
    try {
      const out = await computeMatchProbabilities(f.homeTeam.id, f.awayTeam.id, [2.5], undefined, useAf ? 'apifootball' : 'footballdata');
      if (out.status !== 'ok') return void stats.insufficientData++;
      stats.gamesScanned++;
      const form = { home: out.data.homeFormString, away: out.data.awayFormString, homeGoalsAvg: out.data.homeGoalsAvg, awayGoalsAvg: out.data.awayGoalsAvg };
      for (const market of CANDIDATE_MARKETS) {
        const scored = scoreForMarket(market, out.data.probs);
        if (!scored) continue;
        const modelOdds = safeOdds(scored.probability);
        candidates.push({
          externalEventId: String(f.id),
          homeTeam: f.homeTeam.name,
          awayTeam: f.awayTeam.name,
          competition: f.competition.name,
          market: marketLabelFor(market),
          score: scored.score,
          modelOdds,
          probability: scored.probability,
          odds: modelOdds,
          oddsSource: 'model',
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

export async function collectCandidates(): Promise<Collected> {
  const started = Date.now();
  return (await fromBookmaker(started)) ?? (await fromFixtures(started));
}
