// Betway NG prices for one match, for the Odds Comparison page.
//
// Betway uses its own event IDs, so the match is found by team names +
// kickoff: page Betway's upcoming football events, match the game, then read
// that event's "Main" markets (1X2 and Over/Under) in a single call.
//
// Endpoints/shapes come from the public repo Slipcheck-Demo/backend
// (docs/betway-api.md, src/betway/*), documented from live tests.
// Not yet run from our own server. BTTS is not in the "Main" group, so it
// isn't included.

import { normalizeTeamName, similarity } from './teamMatcher';

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

// Keys match the market keys used by oddsPapi.ts (1x2, ou1.5, ou2.5, ou3.5).
export type BetwayPrices = Record<string, (number | null)[]>;

export async function getBetwayMatchPrices(
  home: string,
  away: string,
  kickoffAt: string,
): Promise<BetwayPrices | null> {
  const event = await findEvent(home, away, kickoffAt);
  if (!event) return null;

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
  if (!body?.marketsInGroup || !body.outcomes) return null;

  const priceById = new Map((body.prices ?? []).map((p) => [String(p.outcomeId), Number(p.priceDecimal)]));
  // Lines arrive as squashed parent/child pairs: outcomes point at the child via originalMarketId.
  const outcomesOf = (m: Json) =>
    body.outcomes!.filter((o) => String(o.originalMarketId ?? o.marketId) === String(m.marketId));
  const live = (m: Json) => m.isActive !== false && m.isSuspended !== true && !m.isSquashedParent;
  const nameOf = (m: Json) => String(m.displayName ?? m.name ?? '');
  const priceOf = (o: Json | undefined): number | null => {
    const p = o && o.isTradingActive !== false ? priceById.get(String(o.outcomeId)) : undefined;
    return p && Number.isFinite(p) ? p : null;
  };

  const result: BetwayPrices = {};

  const x2 = body.marketsInGroup.find((m) => live(m) && /^(1x2|win\/draw\/win|match result)$/i.test(nameOf(m).trim()));
  if (x2) {
    const outs = outcomesOf(x2).sort((a, b) => Number(a.index) - Number(b.index));
    if (outs.length === 3 && /draw/i.test(String(outs[1].name))) result['1x2'] = outs.map(priceOf);
  }

  for (const m of body.marketsInGroup) {
    if (!live(m) || !/total/i.test(nameOf(m)) || /(home|away|team|half|corner|card)/i.test(nameOf(m))) continue;
    const outs = outcomesOf(m);
    const line = nameOf(m).match(/\(([\d.]+)\)/)?.[1] ?? outs[0]?.sbv?.match(/[\d.]+/)?.[0];
    if (!line || !['1.5', '2.5', '3.5'].includes(line)) continue;
    const pick = (word: string) => outs.find((o) => String(o.name).trim().toLowerCase().startsWith(word));
    result[`ou${line}`] = [priceOf(pick('over')), priceOf(pick('under'))];
  }

  return Object.keys(result).length ? result : null;
}
