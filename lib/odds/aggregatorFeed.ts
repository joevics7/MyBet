// OddsPapi (https://oddspapi.io/en/docs, API v4): the FALLBACK source and the
// way to reach bookmakers we have no direct feed for (hundreds worldwide).
//
//   GET /v4/fixtures            -> matches in a window (carries betradarId = Sportradar id)
//   GET /v4/odds-by-tournaments -> odds from ALL bookmakers for every fixture in the
//                                  given tournaments, one call for several tournaments
//   GET /v4/markets, /v4/bookmakers (cached 24h) -> market ids/names, bookmaker names
//
// Env: ODDSPAPI_API_KEY. Without it this source is simply skipped.
//
// Cost control: tournaments that contain matches our direct sources already
// list are fetched first; a hard cap on batches and a time budget keep one
// page build bounded. Responses can be large and are not verified from our
// server, so every batch is individually time-boxed and failures are skipped.

import { num, sleep, type AggregatorMatch, type OddsByMarket } from './types';

const BASE = 'https://api.oddspapi.io/v4';
const SOCCER = 10;
const BATCH_SIZE = 4;
const MAX_BATCHES = 6;
const TIME_BUDGET_MS = 40000;
const DAY = 24 * 3600 * 1000;
type Json = Record<string, any>;

export function isAggregatorConfigured(): boolean {
  return !!process.env.ODDSPAPI_API_KEY;
}

const COOLDOWN: Record<string, number> = { fixtures: 2000, 'odds-by-tournaments': 1000, markets: 1000, bookmakers: 1000 };
const lastCall: Record<string, number> = {};
const chain: Record<string, Promise<unknown>> = {};

async function call<T>(endpoint: string, params: Record<string, string>, opts: { revalidate?: number; timeoutMs?: number } = {}): Promise<T> {
  const run = async (): Promise<T> => {
    const wait = (lastCall[endpoint] ?? 0) + (COOLDOWN[endpoint] ?? 1000) - Date.now();
    if (wait > 0) await sleep(wait);
    lastCall[endpoint] = Date.now();
    const qs = new URLSearchParams({ ...params, apiKey: process.env.ODDSPAPI_API_KEY ?? '' });
    const res = await fetch(`${BASE}/${endpoint}?${qs}`, {
      signal: AbortSignal.timeout(opts.timeoutMs ?? 12000),
      ...(opts.revalidate ? { next: { revalidate: opts.revalidate } } : { cache: 'no-store' as const }),
    });
    if (!res.ok) throw new Error(`OddsPapi ${endpoint} ${res.status}: ${(await res.text()).slice(0, 160)}`);
    return (await res.json()) as T;
  };
  const prev = chain[endpoint] ?? Promise.resolve();
  const next = prev.then(run, run);
  chain[endpoint] = next.catch(() => undefined);
  return next;
}

// ---- reference data (cached 24h) --------------------------------------------

interface MarketDef {
  marketId: number;
  marketName: string;
  sportId?: number;
  marketType: string;
  period: string;
  handicap: number;
  outcomes: { outcomeId: number; outcomeName: string }[];
}
interface Wanted {
  key: keyof OddsByMarket;
  marketId: number;
  outcomeIds: number[]; // in display order
}

let wantedCache: { at: number; data: Wanted[] } | null = null;

async function wantedMarkets(): Promise<Wanted[]> {
  if (wantedCache && Date.now() - wantedCache.at < DAY) return wantedCache.data;
  const all = (await call<MarketDef[]>('markets', { language: 'en' }, { revalidate: 86400 })).filter(
    (m) => m.sportId === undefined || m.sportId === SOCCER,
  );
  const out: Wanted[] = [];
  const x2 = all.find((m) => m.marketType === '1x2' && m.period === 'fulltime' && m.outcomes.length === 3);
  if (x2) out.push({ key: '1x2', marketId: x2.marketId, outcomeIds: x2.outcomes.map((o) => o.outcomeId) });
  for (const line of [1.5, 2.5, 3.5]) {
    const m = all.find((x) => /^over under full time$/i.test(x.marketName) && x.period === 'fulltime' && x.handicap === line && x.outcomes.length === 2);
    if (!m) continue;
    const over = m.outcomes.find((o) => /over/i.test(o.outcomeName));
    const under = m.outcomes.find((o) => /under/i.test(o.outcomeName));
    if (over && under) out.push({ key: `ou${line}` as 'ou2.5', marketId: m.marketId, outcomeIds: [over.outcomeId, under.outcomeId] });
  }
  const b = all.find((x) => /both teams to score/i.test(x.marketName) && x.period === 'fulltime' && x.outcomes.length === 2);
  if (b) {
    const yes = b.outcomes.find((o) => /yes/i.test(o.outcomeName));
    const no = b.outcomes.find((o) => /no/i.test(o.outcomeName));
    if (yes && no) out.push({ key: 'btts', marketId: b.marketId, outcomeIds: [yes.outcomeId, no.outcomeId] });
  }
  wantedCache = { at: Date.now(), data: out };
  return out;
}

let namesCache: { at: number; map: Record<string, string> } | null = null;
async function bookmakerNames(): Promise<Record<string, string>> {
  if (namesCache && Date.now() - namesCache.at < DAY) return namesCache.map;
  const map: Record<string, string> = {};
  try {
    const rows = await call<Json[]>('bookmakers', {}, { revalidate: 86400 });
    for (const r of Array.isArray(rows) ? rows : []) {
      const slug = r.slug ?? r.bookmaker ?? r.bookmakerSlug;
      const name = r.bookmakerName ?? r.name ?? r.displayName;
      if (slug && name) map[String(slug)] = String(name);
    }
  } catch (err) {
    console.error('[aggregator] bookmaker names failed, using slugs:', err);
  }
  namesCache = { at: Date.now(), map };
  return map;
}
const prettify = (s: string) => s.replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

// ---- fetch --------------------------------------------------------------------

function toMatch(f: Json, wanted: Wanted[], names: Record<string, string>): AggregatorMatch | null {
  if (!f.participant1Name || !f.participant2Name || !f.startTime) return null;
  const books: AggregatorMatch['books'] = {};
  for (const [slug, bm] of Object.entries<Json>(f.bookmakerOdds ?? {})) {
    if (bm.bookmakerIsActive === false || bm.suspended === true) continue;
    const odds: OddsByMarket = {};
    for (const w of wanted) {
      const mk = bm.markets?.[String(w.marketId)];
      if (!mk || mk.marketActive === false) continue;
      const prices = w.outcomeIds.map((id) => {
        const p = mk.outcomes?.[String(id)]?.players?.['0'];
        return p && p.active !== false ? num(p.price) : null;
      });
      if (prices.some((x) => x !== null)) (odds as Json)[w.key] = prices;
    }
    if (Object.keys(odds).length) books[slug] = { label: names[slug] ?? prettify(slug), odds };
  }
  if (!Object.keys(books).length) return null;
  const br = f.externalProviders?.betradarId;
  return {
    srId: br ? `sr:match:${br}` : null,
    home: String(f.participant1Name),
    away: String(f.participant2Name),
    kickoff: new Date(f.startTime).toISOString(),
    league: String(f.tournamentName ?? ''),
    country: String(f.categoryName ?? ''),
    books,
  };
}

export async function fetchAggregatorDay(fromMs: number, toMs: number, knownSrIds: Set<string>): Promise<AggregatorMatch[]> {
  const started = Date.now();
  const fixtures = await call<Json[]>(
    'fixtures',
    {
      sportId: String(SOCCER),
      from: new Date(fromMs).toISOString().replace('.000Z', 'Z'),
      to: new Date(toMs).toISOString().replace('.000Z', 'Z'),
      statusId: '0',
      hasOdds: 'true',
    },
    { revalidate: 900 },
  );
  const list = Array.isArray(fixtures) ? fixtures : [];

  // Tournaments holding matches our direct sources already list come first.
  const score = new Map<number, number>();
  for (const f of list) {
    const tid = Number(f.tournamentId);
    if (!Number.isFinite(tid)) continue;
    const known = knownSrIds.has(`sr:match:${f.externalProviders?.betradarId}`) ? 10 : 0;
    score.set(tid, (score.get(tid) ?? 0) + 1 + known);
  }
  const tournaments = Array.from(score.entries()).sort((a, b) => b[1] - a[1]).map(([id]) => id);
  const batches: number[][] = [];
  for (let i = 0; i < tournaments.length && batches.length < MAX_BATCHES; i += BATCH_SIZE) batches.push(tournaments.slice(i, i + BATCH_SIZE));

  const [wanted, names] = await Promise.all([wantedMarkets(), bookmakerNames()]);
  const out: AggregatorMatch[] = [];
  for (const batch of batches) {
    if (Date.now() - started > TIME_BUDGET_MS) break;
    try {
      const raw = await call<Json>('odds-by-tournaments', { tournamentIds: batch.join(',') }, { timeoutMs: 15000 });
      const rows: Json[] = Array.isArray(raw) ? raw : Array.isArray(raw?.fixtures) ? raw.fixtures : Object.values(raw ?? {}).filter((x): x is Json => typeof x === 'object');
      for (const f of rows) {
        const t = Date.parse(f.startTime);
        if (!(t >= fromMs && t < toMs)) continue;
        const m = toMatch(f, wanted, names);
        if (m) out.push(m);
      }
    } catch (err) {
      console.error('[aggregator] batch failed, skipping:', batch, err);
    }
  }
  return out;
}
