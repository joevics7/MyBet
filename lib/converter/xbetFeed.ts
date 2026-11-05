// A 1xBet-style site's football match list, read from the site itself (the same list its website shows).
// Used to find "the same game" on those sites so a pick from elsewhere can be turned into that site's own GameId.
// The sites share one engine, so one reader serves all of them; only the host and partner number differ.
//
// The exact request for a plain day list was not in any capture (only league-winner and per-league lists were), so this tries
// three variants and remembers which one worked. /api/cron/xbet-probe shows what each site answers.

type Json = Record<string, any>;

export const XBET_SITES: Record<string, { origin: string; ref: number; gr?: number }> = {
  paripesa: { origin: 'https://paripesa.ng', ref: 188, gr: 758 },
  '1xbet': { origin: 'https://1xbet.ng', ref: 159, gr: 412 },
  melbet: { origin: 'https://melbet.com', ref: 8 },
  helabet: { origin: 'https://helabet.ng', ref: 237 },
  betwinner: { origin: 'https://betwinner.ng', ref: 152 },
  afropari: { origin: 'https://afropari.com', ref: 300 },
};

export interface XbetGame { id: number; home: string; away: string; startMs: number; league: string }

const num = (v: unknown): number | null => { const n = Number(v); return v !== null && v !== '' && Number.isFinite(n) ? n : null; };
const text = (v: unknown): string => (typeof v === 'string' ? v : '');

// Handles both shapes seen in the captures: a bare array of games (opponent1/opponent2, startTs, liga) and {items:[...]}
// (opp1/opp2, dateStart, champName). Anything without an id, two team names and a start time is skipped.
export function parseXbetGames(json: unknown): XbetGame[] {
  const j = json as Json;
  const arr: Json[] = Array.isArray(j) ? j : Array.isArray(j?.items) ? j.items : Array.isArray(j?.Value) ? j.Value : [];
  const out: XbetGame[] = [];
  for (const g of arr) {
    if (g?.sportId !== undefined && Number(g.sportId) !== 1) continue; // football only
    const id = num(g.id ?? g.gameId);
    const home = text(g.opponent1?.fullName) || text(g.opponent1?.name) || text(g.opp1);
    const away = text(g.opponent2?.fullName) || text(g.opponent2?.name) || text(g.opp2);
    let start = num(g.startTs ?? g.dateStart);
    if (id === null || !home || !away || start === null) continue;
    if (start < 1e12) start *= 1000; // seconds -> ms
    out.push({ id, home, away, startMs: start, league: text(g.liga?.name) || text(g.champName) });
  }
  return out;
}

const cache = new Map<string, { at: number; games: XbetGame[] }>();
const workingVariant = new Map<string, number>();
const TTL_MS = 10 * 60 * 1000;

function variants(site: string, from: number, to: number): string[] {
  const cfg = XBET_SITES[site];
  const common = `cfView=3&fcountry=132&grMode=4&lng=en&ref=${cfg.ref}${cfg.gr ? `&gr=${cfg.gr}` : ''}&count=300&dateFrom=${from}&dateTo=${to}`;
  const base = '/service-api/main-line-feed/v3/games1x2';
  return [`${base}?${common}`, `${base}?${common}&sportIds=1`, `${base}?${common}&sports=1`];
}

// All football games the site lists starting on that UTC day. Throws if the list cannot be read (blocked / unknown shape).
export async function fetchXbetGames(site: string, dayIso: string): Promise<XbetGame[]> {
  const cfg = XBET_SITES[site];
  if (!cfg) throw new Error(`Unknown site ${site}`);
  const key = `${site}:${dayIso}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.games;

  const from = Math.floor(Date.parse(`${dayIso}T00:00:00Z`) / 1000);
  const paths = variants(site, from, from + 86400);
  const order = [workingVariant.get(site), ...paths.map((_, i) => i)].filter((x, i, a): x is number => x !== undefined && a.indexOf(x) === i);
  let lastProblem = 'no variant worked';
  for (const i of order) {
    try {
      const res = await fetch(`${cfg.origin}${paths[i]}`, {
        headers: {
          Accept: 'application/json, text/plain, */*',
          'Accept-Language': 'en-US,en;q=0.9',
          Origin: cfg.origin,
          Referer: `${cfg.origin}/en/line/football`,
          'User-Agent': 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36',
        },
        cache: 'no-store',
      });
      const body = await res.text();
      if (!res.ok || /^\s*</.test(body)) { lastProblem = `${site} answered ${res.status}${/^\s*</.test(body) ? ' with a security page' : ''}`; continue; }
      const games = parseXbetGames(JSON.parse(body));
      if (games.length === 0) { lastProblem = `${site}'s list came back empty or in a shape we don't read`; continue; }
      workingVariant.set(site, i);
      cache.set(key, { at: Date.now(), games });
      return games;
    } catch (err) {
      lastProblem = err instanceof Error ? err.message : String(err);
    }
  }
  throw new Error(lastProblem);
}
