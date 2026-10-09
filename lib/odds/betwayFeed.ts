// Direct feed for Betway Nigeria: upcoming football events with 1X2 prices.
//   GET .../feeds-roa2/BetBook/Upcoming/?sportId=..&Skip=..&Take=..&marketTypes=[Win/Draw/Win]
// returns flat arrays events / markets / outcomes / prices joined by ids.
// Shapes from the public repo Slipcheck-Demo/backend (docs/betway-api.md,
// src/betway/*), documented from live tests. Not yet run from our server.
// Betway has no Sportradar id, so its matches are joined by team + kickoff.

import { num, sleep, type FeedMatch } from './types';

const FEEDS = 'https://www.betway.com.ng/appsynapse/feeds-roa2';
const CONFIG = 'https://www.betway.com.ng/appsynapse/config';
const TAKE = 20;
const MAX_PAGES = 24;
const CONCURRENCY = 4;
type Json = Record<string, any>;

async function getJson<T>(url: string): Promise<T> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(10000), cache: 'no-store' });
    if (res.status === 429 || res.status === 400) {
      const body = (await res.json().catch(() => null)) as Json | null;
      if (res.status === 429 || body?.errorCode === 6000359) {
        await sleep(1500 * (attempt + 1));
        continue;
      }
      throw new Error(`Betway HTTP ${res.status}`);
    }
    if (!res.ok) throw new Error(`Betway HTTP ${res.status}`);
    return (await res.json()) as T;
  }
  throw new Error('Betway rate limited');
}

async function soccerSportId(): Promise<string> {
  const body = await getJson<{ sports: Json[] }>(`${CONFIG}/cron/sports/NG/en-US`);
  const s = body.sports?.find((x) => x.sportType === 'Sport' && /^(soccer|football)$/i.test(String(x.name)));
  if (!s) throw new Error('Betway: football sport id not found');
  return String(s.sportId);
}

async function page(sportId: string, n: number): Promise<{ events: Json[]; markets: Json[]; outcomes: Json[]; prices: Json[]; isFinalPage?: boolean }> {
  const qs = new URLSearchParams({
    countryCode: 'NG',
    sportId,
    Skip: String(n * TAKE),
    Take: String(TAKE),
    cultureCode: 'en-US',
    isEsport: 'false',
    boostedOnly: 'false',
  });
  qs.append('marketTypes', '[Win/Draw/Win]');
  const b = await getJson<Json>(`${FEEDS}/BetBook/Upcoming/?${qs}`);
  return { events: b.events ?? [], markets: b.markets ?? [], outcomes: b.outcomes ?? [], prices: b.prices ?? [], isFinalPage: b.isFinalPage };
}

function convert(p: Awaited<ReturnType<typeof page>>, fromMs: number, toMs: number): FeedMatch[] {
  const priceById = new Map(p.prices.map((x) => [String(x.outcomeId), num(x.priceDecimal)]));
  const out: FeedMatch[] = [];
  for (const e of p.events) {
    const start = Number(e.expectedStartEpoch) * 1000;
    if (!Number.isFinite(start) || start < fromMs || start >= toMs) continue;
    if (e.isLive || /e-?soccer|esport|virtual/i.test(`${e.league ?? ''} ${e.region ?? ''}`)) continue;
    const mkt = p.markets.find(
      (m) => String(m.eventId) === String(e.eventId) && !m.isSquashedParent && m.isActive !== false && m.isSuspended !== true &&
        /^(1x2|win\/draw\/win|match result)$/i.test(String(m.displayName ?? m.name ?? '').trim()),
    );
    if (!mkt) continue;
    const outs = p.outcomes
      .filter((o) => String(o.originalMarketId ?? o.marketId) === String(mkt.marketId))
      .sort((a, b) => Number(a.index) - Number(b.index));
    if (outs.length !== 3 || !/draw/i.test(String(outs[1].name))) continue;
    const prices = outs.map((o) => (o.isTradingActive === false ? null : priceById.get(String(o.outcomeId)) ?? null));
    if (prices.every((x) => x === null)) continue;
    out.push({
      srId: null,
      home: String(e.homeTeam),
      away: String(e.awayTeam),
      kickoff: new Date(start).toISOString(),
      league: String(e.league ?? ''),
      country: String(e.region ?? ''),
      odds: { '1x2': prices },
    });
  }
  return out;
}

export async function fetchBetwayFeed(fromMs: number, toMs: number): Promise<FeedMatch[]> {
  const sportId = await soccerSportId();
  const first = await page(sportId, 0);
  const all = convert(first, fromMs, toMs);
  let done = first.isFinalPage === true || first.events.length === 0;

  for (let start = 1; !done && start < MAX_PAGES; start += CONCURRENCY) {
    const batch = Array.from({ length: Math.min(CONCURRENCY, MAX_PAGES - start) }, (_, i) => start + i);
    const results = await Promise.allSettled(batch.map((n) => page(sportId, n)));
    let latest = 0;
    for (const r of results) {
      if (r.status !== 'fulfilled') continue;
      all.push(...convert(r.value, fromMs, toMs));
      if (r.value.isFinalPage || r.value.events.length === 0) done = true;
      for (const e of r.value.events) latest = Math.max(latest, Number(e.expectedStartEpoch) * 1000);
    }
    if (latest > toMs) done = true; // events are time-ordered: nothing more in the window
  }
  return all;
}
