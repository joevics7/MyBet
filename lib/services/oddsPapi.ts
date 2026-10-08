// OddsPapi client (https://oddspapi.io/en/docs, API v4) -- a global bookmaker
// odds aggregator. Used for (a) prices from hundreds of bookmakers we have no
// direct adapter for and (b) a sharp reference price (Pinnacle).
//
// Env: ODDSPAPI_API_KEY
//
// Matching: fixtures carry `externalProviders.betradarId` (the Sportradar
// match ID), so a SportyBet-style "sr:match:N" maps to a fixture exactly;
// otherwise we fall back to team-name + kickoff matching.
//
// Request cost (free tier is only ~250/month): per slip = fixtures list (1 per
// distinct date, cached) + odds (1 per pick, cached) + markets/bookmakers
// (cached 24h). Endpoint cooldowns: fixtures 2s, odds 0.5s, markets 1s.

import { normalizeTeamName, similarity } from './teamMatcher';

const BASE = 'https://api.oddspapi.io/v4';
const SOCCER_SPORT_ID = 10;
const SHARP_SLUG = 'pinnacle';

export function isOddsPapiConfigured(): boolean {
  return !!process.env.ODDSPAPI_API_KEY;
}

type Json = Record<string, any>;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Per-endpoint spacing so we respect OddsPapi's cooldowns.
const COOLDOWN_MS: Record<string, number> = { fixtures: 2000, odds: 500, markets: 1000, bookmakers: 1000 };
const lastCall: Record<string, number> = {};
const chain: Record<string, Promise<unknown>> = {};

async function call<T>(endpoint: keyof typeof COOLDOWN_MS, params: Record<string, string>, retry = true): Promise<T> {
  // Serialise calls per endpoint (parallel legs share one queue).
  const run = async (): Promise<T> => {
    const wait = (lastCall[endpoint] ?? 0) + COOLDOWN_MS[endpoint] - Date.now();
    if (wait > 0) await sleep(wait);
    lastCall[endpoint] = Date.now();

    const qs = new URLSearchParams({ ...params, apiKey: process.env.ODDSPAPI_API_KEY ?? '' });
    const res = await fetch(`${BASE}/${endpoint}?${qs.toString()}`, { signal: AbortSignal.timeout(10000) });
    if (res.status === 429 && retry) {
      await sleep(COOLDOWN_MS[endpoint] + 500);
      return call<T>(endpoint, params, false);
    }
    if (!res.ok) throw new Error(`OddsPapi ${endpoint} failed: ${res.status} ${(await res.text()).slice(0, 200)}`);
    return (await res.json()) as T;
  };
  const prev = chain[endpoint] ?? Promise.resolve();
  const next = prev.then(run, run);
  chain[endpoint] = next.catch(() => undefined);
  return next;
}

// ---- cached reference data ------------------------------------------------

interface MarketDef {
  marketId: number;
  marketName: string;
  sportId?: number;
  marketType: string;
  period: string;
  handicap: number;
  outcomes: { outcomeId: number; outcomeName: string }[];
}

let marketsCache: { at: number; data: MarketDef[] } | null = null;
const DAY = 24 * 3600 * 1000;

async function getMarkets(): Promise<MarketDef[]> {
  if (marketsCache && Date.now() - marketsCache.at < DAY) return marketsCache.data;
  const data = await call<MarketDef[]>('markets', { language: 'en' });
  marketsCache = { at: Date.now(), data };
  return data;
}

let bookmakerNames: { at: number; map: Record<string, string> } | null = null;

async function getBookmakerNames(): Promise<Record<string, string>> {
  if (bookmakerNames && Date.now() - bookmakerNames.at < DAY) return bookmakerNames.map;
  const map: Record<string, string> = {};
  try {
    const rows = await call<Json[]>('bookmakers', {});
    for (const r of Array.isArray(rows) ? rows : []) {
      const slug = r.slug ?? r.bookmaker ?? r.bookmakerSlug;
      const name = r.bookmakerName ?? r.name ?? r.displayName;
      if (slug && name) map[String(slug)] = String(name);
    }
  } catch (err) {
    console.error('[oddsPapi] bookmakers list failed (using slugs):', err);
  }
  bookmakerNames = { at: Date.now(), map };
  return map;
}

const prettify = (slug: string) => slug.replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

// ---- fixture lookup -------------------------------------------------------

const fixtureCache = new Map<string, { at: number; data: Json[] }>();

async function fixturesForDate(date: string): Promise<Json[]> {
  const hit = fixtureCache.get(date);
  if (hit && Date.now() - hit.at < 30 * 60 * 1000) return hit.data;
  const from = `${date}T00:00:00Z`;
  const to = new Date(Date.parse(from) + 24 * 3600 * 1000).toISOString().replace('.000Z', 'Z');
  const data = await call<Json[]>('fixtures', {
    sportId: String(SOCCER_SPORT_ID),
    from,
    to,
    statusId: '0',
    hasOdds: 'true',
  });
  const rows = Array.isArray(data) ? data : [];
  fixtureCache.set(date, { at: Date.now(), data: rows });
  return rows;
}

export interface LegRef {
  externalEventId: string; // may be "sr:match:N"
  homeTeam: string;
  awayTeam: string;
  kickoffAt: string | null;
}

async function findFixture(leg: LegRef): Promise<Json | null> {
  if (!leg.kickoffAt) return null;
  const kickoff = Date.parse(leg.kickoffAt);
  if (Number.isNaN(kickoff)) return null;

  // A fixture near midnight UTC can sit on the neighbouring date's list.
  const dates = Array.from(
    new Set([kickoff - 3 * 3600e3, kickoff + 3 * 3600e3].map((t) => new Date(t).toISOString().slice(0, 10))),
  );
  const lists = await Promise.all(dates.map(fixturesForDate));
  const all = lists.flat();

  const sr = leg.externalEventId.match(/^sr:match:(\d+)$/)?.[1];
  if (sr) {
    const exact = all.find((f) => String(f.externalProviders?.betradarId) === sr);
    if (exact) return exact;
  }

  const h = normalizeTeamName(leg.homeTeam);
  const a = normalizeTeamName(leg.awayTeam);
  let best: { f: Json; score: number } | null = null;
  for (const f of all) {
    if (Math.abs(Date.parse(f.startTime) - kickoff) > 3 * 3600e3) continue;
    const hs = similarity(h, normalizeTeamName(f.participant1Name ?? ''));
    const as = similarity(a, normalizeTeamName(f.participant2Name ?? ''));
    if (hs < 0.6 || as < 0.6) continue;
    if (!best || hs + as > best.score) best = { f, score: hs + as };
  }
  return best?.f ?? null;
}

// ---- market selection -----------------------------------------------------

export type Pick =
  | { type: '1X2'; pick: 'home' | 'draw' | 'away' }
  | { type: 'OVER_UNDER'; pick: 'over' | 'under'; line: number }
  | { type: 'BTTS'; pick: 'yes' | 'no' };

// The market (all outcomes) and which outcome id is the user's pick.
async function resolveMarket(pick: Pick): Promise<{ marketId: number; outcomeIds: number[]; pickId: number } | null> {
  const markets = await getMarkets();
  const soccer = markets.filter((m) => m.sportId === undefined || m.sportId === SOCCER_SPORT_ID);
  if (pick.type === '1X2') {
    const m = soccer.find((x) => x.marketType === '1x2' && x.period === 'fulltime' && x.outcomes.length === 3);
    if (!m) return null;
    const idx = { home: 0, draw: 1, away: 2 }[pick.pick];
    return { marketId: m.marketId, outcomeIds: m.outcomes.map((o) => o.outcomeId), pickId: m.outcomes[idx].outcomeId };
  }
  if (pick.type === 'BTTS') {
    const m = soccer.find((x) => /both teams to score/i.test(x.marketName) && x.period === 'fulltime' && x.outcomes.length === 2);
    if (!m) return null;
    const o = m.outcomes.find((x) => x.outcomeName.toLowerCase() === pick.pick);
    return o ? { marketId: m.marketId, outcomeIds: m.outcomes.map((x) => x.outcomeId), pickId: o.outcomeId } : null;
  }
  const m = soccer.find(
    (x) => /^over under full time$/i.test(x.marketName) && x.period === 'fulltime' && x.handicap === pick.line,
  );
  if (!m) return null;
  const o = m.outcomes.find((x) => x.outcomeName.toLowerCase() === pick.pick);
  return o ? { marketId: m.marketId, outcomeIds: m.outcomes.map((x) => x.outcomeId), pickId: o.outcomeId } : null;
}

// ---- public API -----------------------------------------------------------

export interface OutsideQuotes {
  prices: Record<string, number>; // bookmaker slug -> decimal price for the pick
  labels: Record<string, string>;
  sharpProb: number | null; // Pinnacle's no-margin probability for the pick
}

const oddsCache = new Map<string, { at: number; data: Json }>();

export async function lookupOutsideQuotes(leg: LegRef, pick: Pick): Promise<OutsideQuotes | { reason: string }> {
  if (!isOddsPapiConfigured()) return { reason: 'Outside odds not configured' };
  try {
    const fixture = await findFixture(leg);
    if (!fixture) return { reason: 'Match not found in outside odds' };
    const market = await resolveMarket(pick);
    if (!market) return { reason: 'Market not available in outside odds' };

    const key = String(fixture.fixtureId);
    let odds = oddsCache.get(key);
    if (!odds || Date.now() - odds.at > 5 * 60 * 1000) {
      odds = { at: Date.now(), data: await call<Json>('odds', { fixtureId: key }) };
      oddsCache.set(key, odds);
    }

    const names = await getBookmakerNames();
    const prices: Record<string, number> = {};
    const labels: Record<string, string> = {};
    let sharpProb: number | null = null;

    for (const [slug, bm] of Object.entries<Json>(odds.data.bookmakerOdds ?? {})) {
      if (bm.bookmakerIsActive === false || bm.suspended === true) continue;
      const mk = bm.markets?.[String(market.marketId)];
      if (!mk || mk.marketActive === false) continue;

      const priceOf = (oid: number): number | null => {
        const p = mk.outcomes?.[String(oid)]?.players?.['0'];
        return p && p.active !== false && Number.isFinite(p.price) && p.price > 1 ? Number(p.price) : null;
      };
      const price = priceOf(market.pickId);
      if (price === null) continue;
      prices[slug] = price;
      labels[slug] = names[slug] ?? prettify(slug);

      if (slug === SHARP_SLUG) {
        const all = market.outcomeIds.map(priceOf);
        if (all.every((x): x is number => x !== null)) {
          const inv = all.map((x) => 1 / x);
          sharpProb = 1 / price / inv.reduce((a, b) => a + b, 0); // remove the bookmaker margin
        }
      }
    }
    if (Object.keys(prices).length === 0) return { reason: 'No outside prices for this pick' };
    return { prices, labels, sharpProb };
  } catch (err) {
    console.error('[oddsPapi] lookup failed:', err);
    return { reason: 'Outside odds lookup failed' };
  }
}
