// Betway price lookup by browsing, for picks that came from another platform.
//
// Betway uses its own IDs, so a pick is matched by team names + kickoff:
//   1. page Betway's upcoming football events and find the game
//   2. read that event's "Main" markets and find 1X2 / Over-Under
//   3. return the live price (and the outcome ID, which BookABet accepts)
//
// Endpoints/shapes come from the public repo Slipcheck-Demo/backend
// (docs/betway-api.md, src/betway/*), documented from live tests.
// Not yet run from our own server. BTTS is not in the "Main" group, so it
// isn't matched here (reported as "Market not matched").

import { normalizeTeamName, similarity } from './teamMatcher';
import type { Pick } from './oddsPapi';

const FEEDS = 'https://www.betway.com.ng/appsynapse/feeds-roa2';
const CONFIG = 'https://www.betway.com.ng/appsynapse/config';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Json = Record<string, any>;

async function getJson<T>(url: string): Promise<T | null> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(8000) });
      if (res.status === 429 || res.status === 400) {
        const body = (await res.json().catch(() => null)) as Json | null;
        if (res.status === 429 || body?.errorCode === 6000359) {
          await sleep(1500 * (attempt + 1));
          continue;
        }
        return null;
      }
      return res.ok ? ((await res.json()) as T) : null;
    } catch {
      return null;
    }
  }
  return null;
}

// ---- event list (cached) ---------------------------------------------------

let eventsCache: { at: number; events: Json[] } | null = null;
let soccerId: string | null = null;

async function getSoccerSportId(): Promise<string | null> {
  if (soccerId) return soccerId;
  const body = await getJson<{ sports: Json[] }>(`${CONFIG}/cron/sports/NG/en-US`);
  const s = body?.sports?.find((x) => x.sportType === 'Sport' && /^(soccer|football)$/i.test(String(x.name)));
  soccerId = s?.sportId ?? null;
  return soccerId;
}

async function getUpcoming(): Promise<Json[]> {
  if (eventsCache && Date.now() - eventsCache.at < 10 * 60 * 1000) return eventsCache.events;
  const sportId = await getSoccerSportId();
  if (!sportId) return [];

  const events: Json[] = [];
  for (let page = 0; page < 8; page++) {
    const qs = new URLSearchParams({
      countryCode: 'NG',
      sportId,
      Skip: String(page * 40),
      Take: '40',
      cultureCode: 'en-US',
      isEsport: 'false',
      boostedOnly: 'false',
    });
    qs.append('marketTypes', '[Win/Draw/Win]');
    const body = await getJson<{ events?: Json[]; isFinalPage?: boolean }>(`${FEEDS}/BetBook/Upcoming/?${qs}`);
    if (!body?.events) break;
    events.push(...body.events);
    if (body.isFinalPage) break;
  }
  eventsCache = { at: Date.now(), events };
  return events;
}

async function findEvent(home: string, away: string, kickoffAt: string | null): Promise<Json | null> {
  if (!kickoffAt) return null;
  const kickoff = Date.parse(kickoffAt);
  const h = normalizeTeamName(home);
  const a = normalizeTeamName(away);
  let best: { e: Json; score: number } | null = null;
  for (const e of await getUpcoming()) {
    if (/e-?soccer|esport|virtual/i.test(`${e.league ?? ''} ${e.region ?? ''}`)) continue;
    if (Math.abs(e.expectedStartEpoch * 1000 - kickoff) > 3 * 3600e3) continue;
    const hs = similarity(h, normalizeTeamName(String(e.homeTeam ?? '')));
    const as = similarity(a, normalizeTeamName(String(e.awayTeam ?? '')));
    if (hs < 0.6 || as < 0.6) continue;
    if (!best || hs + as > best.score) best = { e, score: hs + as };
  }
  return best?.e ?? null;
}

// ---- market reading --------------------------------------------------------

export interface BetwayPrice {
  odds: number;
  outcomeId: string;
}

export async function lookupBetwayPrice(
  leg: { homeTeam: string; awayTeam: string; kickoffAt: string | null },
  pick: Pick,
): Promise<BetwayPrice | { reason: string }> {
  if (pick.type === 'BTTS') return { reason: 'Market not matched' };

  const event = await findEvent(leg.homeTeam, leg.awayTeam, leg.kickoffAt);
  if (!event) return { reason: 'Match not found' };

  const qs = new URLSearchParams({
    eventId: String(event.eventId),
    marketGroupId: 'Main',
    countryCode: 'NG',
    cultureCode: 'en-US',
    skip: '0',
    take: '20',
    isBuildABetOnly: 'false',
    searchQuery: '',
  });
  const body = await getJson<{ marketsInGroup?: Json[]; outcomes?: Json[]; prices?: Json[] }>(
    `${FEEDS}/MarketGroupings/MarketGroupNamesAndMarketsForEvent?${qs}`,
  );
  if (!body?.marketsInGroup || !body.outcomes) return { reason: 'Lookup failed' };

  const priceById = new Map((body.prices ?? []).map((p) => [String(p.outcomeId), Number(p.priceDecimal)]));
  // Lines arrive as squashed parent/child pairs: outcomes point at the child via originalMarketId.
  const outcomesOf = (m: Json) =>
    body.outcomes!.filter((o) => String(o.originalMarketId ?? o.marketId) === String(m.marketId));
  const live = (m: Json) => m.isActive !== false && m.isSuspended !== true && !m.isSquashedParent;
  const nameOf = (m: Json) => String(m.displayName ?? m.name ?? '');

  const finish = (o: Json | undefined): BetwayPrice | { reason: string } => {
    const odds = o ? priceById.get(String(o.outcomeId)) : undefined;
    if (!o || o.isTradingActive === false || !odds || !Number.isFinite(odds)) return { reason: 'Not offered' };
    return { odds, outcomeId: String(o.outcomeId) };
  };

  if (pick.type === '1X2') {
    const m = body.marketsInGroup.find((x) => live(x) && /^(1x2|win\/draw\/win|match result)$/i.test(nameOf(x).trim()));
    if (!m) return { reason: 'Market not matched' };
    const outs = outcomesOf(m).sort((x, y) => Number(x.index) - Number(y.index));
    if (outs.length !== 3 || !/draw/i.test(String(outs[1].name))) return { reason: 'Market not matched' };
    return finish(outs[{ home: 0, draw: 1, away: 2 }[pick.pick]]);
  }

  // Over/Under: market name or outcome sbv carries the line, e.g. "Total (2.5)".
  const target = String(pick.line);
  const m = body.marketsInGroup.find((x) => {
    if (!live(x) || !/total/i.test(nameOf(x)) || /(home|away|team|half|corner|card)/i.test(nameOf(x))) return false;
    const line = nameOf(x).match(/\(([\d.]+)\)/)?.[1] ?? outcomesOf(x)[0]?.sbv?.match(/[\d.]+/)?.[0];
    return line === target;
  });
  if (!m) return { reason: 'Market not matched' };
  const o = outcomesOf(m).find((x) => String(x.name).trim().toLowerCase().startsWith(pick.pick));
  return finish(o);
}
