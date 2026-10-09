// Direct feed for SportyBet-stack bookmakers (SportyBet; Football.com is a
// white-label of the same stack). One paged endpoint returns every upcoming
// football match WITH its odds:
//   GET {apiBase}/factsCenter/pcUpcomingEvents?sportId=sr:sport:1&marketId=1,18,29
//        &pageSize=100&pageNum=N&todayGames=false&timeline=<hours ahead>
// Response: data.{totalNum, tournaments[{name, categoryName, events[{eventId,
// estimateStartTime, homeTeamName, awayTeamName, markets[{id, specifier,
// outcomes[{id, desc, odds (string), isActive}]}]}]}]}
// Source: public projects using the live endpoint (nikki299/Sportybet-mcp,
// Edehisaboi/sportyBet-odds-scraper). Football.com's copy of the path is
// assumed identical and is unverified.

import { num, sleep, type FeedMatch, type OddsByMarket } from './types';

export interface FamilyConfig {
  slug: string;
  label: string;
  apiBase: string; // e.g. https://www.sportybet.com/api/ng
  origin: string;
}

export const SPORTYBET: FamilyConfig = {
  slug: 'sportybet',
  label: 'SportyBet',
  apiBase: 'https://www.sportybet.com/api/ng',
  origin: 'https://www.sportybet.com',
};

export const FOOTBALLCOM: FamilyConfig = {
  slug: 'footballcom',
  label: 'Football.com',
  apiBase: 'https://www.football.com/api/ng',
  origin: 'https://www.football.com',
};

const PAGE_SIZE = 100;
const MAX_PAGES = 15;
const CONCURRENCY = 3;
type Json = Record<string, any>;

async function getPage(cfg: FamilyConfig, page: number, timelineHours: number): Promise<Json> {
  const qs = new URLSearchParams({
    sportId: 'sr:sport:1',
    marketId: '1,18,29',
    pageSize: String(PAGE_SIZE),
    pageNum: String(page),
    todayGames: 'false',
    timeline: String(timelineHours),
    _t: String(Date.now()),
  });
  const res = await fetch(`${cfg.apiBase}/factsCenter/pcUpcomingEvents?${qs}`, {
    headers: {
      Accept: 'application/json',
      'Current-Country': 'NG',
      Origin: cfg.origin,
      Referer: `${cfg.origin}/ng/`,
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    },
    signal: AbortSignal.timeout(12000),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`${cfg.label} feed HTTP ${res.status}`);
  const json = (await res.json()) as Json;
  if (json.bizCode !== undefined && json.bizCode !== 10000) throw new Error(`${cfg.label} feed bizCode ${json.bizCode}`);
  return json;
}

// Outcome lookup tolerant to id or wording.
function pickOutcome(outs: Json[], ids: string[], desc: RegExp): number | null {
  const o = outs.find((x) => ids.includes(String(x.id))) ?? outs.find((x) => desc.test(String(x.desc ?? '')));
  if (!o || o.isActive === 0 || o.isActive === false) return null;
  return num(o.odds);
}

export function parseMarkets(markets: Json[] | undefined): OddsByMarket {
  const odds: OddsByMarket = {};
  for (const m of markets ?? []) {
    const outs: Json[] = m.outcomes ?? [];
    const id = String(m.id);
    if (id === '1') {
      const p = [
        pickOutcome(outs, ['1'], /^(home|1)$/i),
        pickOutcome(outs, ['2'], /^(draw|x)$/i),
        pickOutcome(outs, ['3'], /^(away|2)$/i),
      ];
      if (p.some((x) => x !== null)) odds['1x2'] = p;
    } else if (id === '18') {
      const line = String(m.specifier ?? '').match(/total=([\d.]+)/)?.[1];
      if (line && ['1.5', '2.5', '3.5'].includes(line)) {
        const p = [pickOutcome(outs, ['12'], /^over/i), pickOutcome(outs, ['13'], /^under/i)];
        if (p.some((x) => x !== null)) odds[`ou${line}` as 'ou2.5'] = p;
      }
    } else if (id === '29') {
      const p = [pickOutcome(outs, ['74'], /^(yes|gg)/i), pickOutcome(outs, ['76'], /^(no|ng)/i)];
      if (p.some((x) => x !== null)) odds.btts = p;
    }
  }
  return odds;
}

function flatten(json: Json, fromMs: number, toMs: number): FeedMatch[] {
  const out: FeedMatch[] = [];
  for (const t of json.data?.tournaments ?? []) {
    for (const e of t.events ?? []) {
      const start = Number(e.estimateStartTime);
      if (!Number.isFinite(start) || start < fromMs || start >= toMs) continue;
      if (!e.homeTeamName || !e.awayTeamName) continue;
      const odds = parseMarkets(e.markets);
      if (Object.keys(odds).length === 0) continue;
      out.push({
        srId: typeof e.eventId === 'string' && e.eventId.startsWith('sr:match:') ? e.eventId : null,
        home: String(e.homeTeamName),
        away: String(e.awayTeamName),
        kickoff: new Date(start).toISOString(),
        league: String(t.name ?? ''),
        country: String(t.categoryName ?? ''),
        odds,
      });
    }
  }
  return out;
}

export async function fetchFamilyFeed(cfg: FamilyConfig, fromMs: number, toMs: number): Promise<FeedMatch[]> {
  const timeline = Math.min(720, Math.max(1, Math.ceil((toMs - Date.now()) / 3600000)));
  const first = await getPage(cfg, 1, timeline);
  const total = Number(first.data?.totalNum) || 0;
  const pages = Math.min(MAX_PAGES, Math.max(1, Math.ceil(total / PAGE_SIZE)));

  const all = flatten(first, fromMs, toMs);
  const rest = Array.from({ length: pages - 1 }, (_, i) => i + 2);
  for (let i = 0; i < rest.length; i += CONCURRENCY) {
    const batch = rest.slice(i, i + CONCURRENCY);
    const results = await Promise.allSettled(batch.map((p) => getPage(cfg, p, timeline)));
    for (const r of results) if (r.status === 'fulfilled') all.push(...flatten(r.value, fromMs, toMs));
    await sleep(250); // be polite
  }

  const seen = new Set<string>();
  return all.filter((m) => {
    const k = m.srId ?? `${m.home}|${m.away}|${m.kickoff}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
