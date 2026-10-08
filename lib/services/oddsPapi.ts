// OddsPapi client (https://oddspapi.io/en/docs, API v4): a global bookmaker
// odds aggregator. Powers the Odds Comparison page: list matches for a date,
// then show one match's odds across every bookmaker that prices it.
//
// Env: ODDSPAPI_API_KEY
//
// Request cost (free tier is only ~250/month): one request per date list
// (cached 30 min), one per match opened (cached 5 min), plus markets and
// bookmaker names (cached 24h). Endpoint cooldowns: fixtures 2s, odds 0.5s,
// markets/bookmakers 1s.

const BASE = 'https://api.oddspapi.io/v4';
const SOCCER_SPORT_ID = 10;
const OU_LINES = [1.5, 2.5, 3.5];

export function isOddsPapiConfigured(): boolean {
  return !!process.env.ODDSPAPI_API_KEY;
}

type Json = Record<string, any>;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Per-endpoint spacing so we respect OddsPapi's cooldowns.
const COOLDOWN_MS: Record<string, number> = { fixtures: 2000, odds: 500, markets: 1000, bookmakers: 1000 };
const lastCall: Record<string, number> = {};
const chain: Record<string, Promise<unknown>> = {};

async function call<T>(
  endpoint: keyof typeof COOLDOWN_MS,
  params: Record<string, string>,
  revalidate: number,
  retry = true,
): Promise<T> {
  const run = async (): Promise<T> => {
    const wait = (lastCall[endpoint] ?? 0) + COOLDOWN_MS[endpoint] - Date.now();
    if (wait > 0) await sleep(wait);
    lastCall[endpoint] = Date.now();

    const qs = new URLSearchParams({ ...params, apiKey: process.env.ODDSPAPI_API_KEY ?? '' });
    const res = await fetch(`${BASE}/${endpoint}?${qs.toString()}`, {
      signal: AbortSignal.timeout(10000),
      next: { revalidate }, // shared cache across visitors keeps quota use low
    });
    if (res.status === 429 && retry) {
      await sleep(COOLDOWN_MS[endpoint] + 500);
      return call<T>(endpoint, params, revalidate, false);
    }
    if (!res.ok) throw new Error(`OddsPapi ${endpoint} failed: ${res.status} ${(await res.text()).slice(0, 200)}`);
    return (await res.json()) as T;
  };
  const prev = chain[endpoint] ?? Promise.resolve();
  const next = prev.then(run, run);
  chain[endpoint] = next.catch(() => undefined);
  return next;
}

// ---- cached reference data ---------------------------------------------------

interface MarketDef {
  marketId: number;
  marketName: string;
  sportId?: number;
  marketType: string;
  period: string;
  handicap: number;
  outcomes: { outcomeId: number; outcomeName: string }[];
}

const DAY = 24 * 3600 * 1000;
let marketsCache: { at: number; data: MarketDef[] } | null = null;

async function getMarkets(): Promise<MarketDef[]> {
  if (marketsCache && Date.now() - marketsCache.at < DAY) return marketsCache.data;
  const data = await call<MarketDef[]>('markets', { language: 'en' }, 86400);
  marketsCache = { at: Date.now(), data };
  return data;
}

let namesCache: { at: number; map: Record<string, string> } | null = null;

async function getBookmakerNames(): Promise<Record<string, string>> {
  if (namesCache && Date.now() - namesCache.at < DAY) return namesCache.map;
  const map: Record<string, string> = {};
  try {
    const rows = await call<Json[]>('bookmakers', {}, 86400);
    for (const r of Array.isArray(rows) ? rows : []) {
      const slug = r.slug ?? r.bookmaker ?? r.bookmakerSlug;
      const name = r.bookmakerName ?? r.name ?? r.displayName;
      if (slug && name) map[String(slug)] = String(name);
    }
  } catch (err) {
    console.error('[oddsPapi] bookmakers list failed (using slugs):', err);
  }
  namesCache = { at: Date.now(), map };
  return map;
}

const prettify = (slug: string) => slug.replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

// ---- match list ----------------------------------------------------------------

export interface MatchSummary {
  fixtureId: string;
  home: string;
  away: string;
  kickoff: string; // ISO
  league: string;
  country: string;
}

export async function listMatches(date: string): Promise<MatchSummary[]> {
  const from = `${date}T00:00:00Z`;
  const to = new Date(Date.parse(from) + 24 * 3600 * 1000).toISOString().replace('.000Z', 'Z');
  const rows = await call<Json[]>(
    'fixtures',
    { sportId: String(SOCCER_SPORT_ID), from, to, statusId: '0', hasOdds: 'true' },
    1800,
  );
  return (Array.isArray(rows) ? rows : [])
    .map((f) => ({
      fixtureId: String(f.fixtureId),
      home: String(f.participant1Name ?? ''),
      away: String(f.participant2Name ?? ''),
      kickoff: new Date(f.startTime).toISOString(),
      league: String(f.tournamentName ?? ''),
      country: String(f.categoryName ?? ''),
    }))
    .filter((m) => m.home && m.away)
    .sort((a, b) => a.kickoff.localeCompare(b.kickoff) || a.league.localeCompare(b.league));
}

// ---- one match's odds ------------------------------------------------------------

export interface OddsRow {
  slug: string;
  label: string;
  prices: (number | null)[]; // one per outcome, same order as `outcomes`
}

export interface MarketTable {
  key: string;
  title: string;
  outcomes: string[];
  rows: OddsRow[];
  best: (number | null)[]; // best price per outcome
}

export interface MatchOdds {
  match: MatchSummary;
  markets: MarketTable[];
}

interface WantedMarket {
  key: string;
  title: string;
  def: MarketDef;
  outcomeLabels: string[];
}

async function wantedMarkets(): Promise<WantedMarket[]> {
  const all = (await getMarkets()).filter((m) => m.sportId === undefined || m.sportId === SOCCER_SPORT_ID);
  const out: WantedMarket[] = [];

  const x2 = all.find((m) => m.marketType === '1x2' && m.period === 'fulltime' && m.outcomes.length === 3);
  if (x2) out.push({ key: '1x2', title: 'Match result (1X2)', def: x2, outcomeLabels: ['Home', 'Draw', 'Away'] });

  for (const line of OU_LINES) {
    const m = all.find((x) => /^over under full time$/i.test(x.marketName) && x.period === 'fulltime' && x.handicap === line);
    if (m && m.outcomes.length === 2) {
      out.push({ key: `ou${line}`, title: `Total goals ${line}`, def: m, outcomeLabels: [`Over ${line}`, `Under ${line}`] });
    }
  }

  const btts = all.find((x) => /both teams to score/i.test(x.marketName) && x.period === 'fulltime' && x.outcomes.length === 2);
  if (btts) out.push({ key: 'btts', title: 'Both teams to score', def: btts, outcomeLabels: ['Yes', 'No'] });
  return out;
}

export async function getMatchOdds(fixtureId: string): Promise<MatchOdds | null> {
  const [data, wanted, names] = await Promise.all([
    call<Json>('odds', { fixtureId }, 300),
    wantedMarkets(),
    getBookmakerNames(),
  ]);
  if (!data?.fixtureId) return null;

  const match: MatchSummary = {
    fixtureId: String(data.fixtureId),
    home: String(data.participant1Name ?? ''),
    away: String(data.participant2Name ?? ''),
    kickoff: data.startTime ? new Date(data.startTime).toISOString() : '',
    league: String(data.tournamentName ?? ''),
    country: String(data.categoryName ?? ''),
  };

  const markets: MarketTable[] = [];
  for (const w of wanted) {
    const rows: OddsRow[] = [];
    for (const [slug, bm] of Object.entries<Json>(data.bookmakerOdds ?? {})) {
      if (bm.bookmakerIsActive === false || bm.suspended === true) continue;
      const mk = bm.markets?.[String(w.def.marketId)];
      if (!mk || mk.marketActive === false) continue;
      const prices = w.def.outcomes.map((o) => {
        const p = mk.outcomes?.[String(o.outcomeId)]?.players?.['0'];
        return p && p.active !== false && Number.isFinite(p.price) && p.price > 1 ? Number(p.price) : null;
      });
      if (prices.every((x) => x === null)) continue;
      rows.push({ slug, label: names[slug] ?? prettify(slug), prices });
    }
    if (rows.length) markets.push({ key: w.key, title: w.title, outcomes: w.outcomeLabels, rows, best: [] });
  }
  return { match, markets };
}

// Sort rows by bookmaker margin (lowest first = fairest prices), then mark best prices.
export function finishTables(markets: MarketTable[]): MarketTable[] {
  const margin = (r: OddsRow) =>
    r.prices.every((p) => p !== null) ? r.prices.reduce<number>((a, p) => a + 1 / (p as number), 0) : Infinity;
  for (const m of markets) {
    m.rows.sort((a, b) => {
      const ma = margin(a);
      const mb = margin(b);
      return ma === mb ? 0 : ma < mb ? -1 : 1; // plain compare: Infinity - Infinity is NaN
    });
    m.best = m.outcomes.map((_, i) => {
      const vals = m.rows.map((r) => r.prices[i]).filter((p): p is number => p !== null);
      return vals.length ? Math.max(...vals) : null;
    });
  }
  return markets;
}
