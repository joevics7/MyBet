// API-Football (api-sports.io): thin client. Used only inside one predictor run (lib/footballApi/liveDay.ts) and when the
// predictor history checks a finished game. Nothing from it is saved. Docs: https://www.api-football.com/documentation-v3
//
// Env: API_FOOTBALL_KEY.

import type { FdMatch } from './footballData';

const BASE_URL = 'https://v3.football.api-sports.io';

// A suspended account or an exhausted quota answers every call with an error: stop calling until it can work again.
let blockedUntil = 0; // epoch ms
let minuteLimit = 0;  // requests per minute the plan allows, learned from the response headers
// Gap between requests that keeps us under the per-minute limit (the free plan allows about 10 a minute).
export function requestGapMs(): number {
  return minuteLimit > 0 ? Math.ceil(60000 / minuteLimit) + 150 : 6500;
}
const nextUtcMidnight = () => { const d = new Date(); d.setUTCHours(24, 0, 0, 0); return d.getTime(); };
export function isApiFootballConfigured(): boolean {
  return !!process.env.API_FOOTBALL_KEY && Date.now() >= blockedUntil;
}

type Json = Record<string, any>;

// API-Football reports many failures (bad key, quota, bad params) as HTTP 200 with a non-empty `errors` field.
async function apiFetch<T = Json[]>(path: string): Promise<T> {
  const key = process.env.API_FOOTBALL_KEY;
  if (!key) throw new Error('API_FOOTBALL_KEY is not set.');
  const res = await fetch(`${BASE_URL}${path}`, { headers: { 'x-apisports-key': key }, cache: 'no-store' });
  if (res.status === 429) {
    blockedUntil = Date.now() + 70e3; // the free plan's per-minute limit: wait a minute, not a day
    throw new Error('API-Football rate limit hit.');
  }
  if (!res.ok) throw new Error(`API-Football request failed: ${res.status} ${(await res.text()).slice(0, 200)}`);

  const perMinute = Number(res.headers.get('x-ratelimit-limit'));
  if (Number.isFinite(perMinute) && perMinute > 0) minuteLimit = perMinute;
  const json = (await res.json()) as Json;
  const errs = json.errors;
  const hasErrors = Array.isArray(errs) ? errs.length > 0 : errs && Object.keys(errs).length > 0;
  if (hasErrors) {
    const text = JSON.stringify(errs);
    if (/suspended/i.test(text)) blockedUntil = Date.now() + 6 * 3600e3;
    else if (/per minute|rateLimit/i.test(text)) blockedUntil = Date.now() + 70e3; // too fast, not out of quota
    else if (/limit|quota|too many/i.test(text)) blockedUntil = nextUtcMidnight();
    throw new Error(`API-Football error: ${text.slice(0, 300)}`);
  }
  return json.response as T;
}

function mapStatus(short: string): FdMatch['status'] {
  if (['TBD', 'NS'].includes(short)) return 'SCHEDULED';
  if (['1H', '2H', 'ET', 'BT', 'P', 'LIVE', 'INT'].includes(short)) return 'IN_PLAY';
  if (short === 'HT') return 'PAUSED';
  if (['FT', 'AET', 'PEN'].includes(short)) return 'FINISHED';
  if (['PST', 'SUSP'].includes(short)) return 'POSTPONED';
  return 'CANCELLED'; // CANC, ABD, AWD, WO
}

function toMatch(f: Json): FdMatch {
  return {
    id: f.fixture.id,
    utcDate: new Date(f.fixture.date).toISOString(),
    status: mapStatus(f.fixture.status?.short ?? ''),
    homeTeam: { id: f.teams.home.id, name: f.teams.home.name, shortName: f.teams.home.name },
    awayTeam: { id: f.teams.away.id, name: f.teams.away.name, shortName: f.teams.away.name },
    // 90-minute score when available (the model is a 90-minute model).
    score: { fullTime: { home: f.score?.fulltime?.home ?? f.goals?.home ?? null, away: f.score?.fulltime?.away ?? f.goals?.away ?? null } },
    competition: { id: f.league.id, name: f.league.name },
  };
}

// ONE request: every league's fixtures (with scores and status) for one UTC date.
export async function fetchFixturesForDate(date: string): Promise<FdMatch[]> {
  const rows = await apiFetch<Json[]>(`/fixtures?date=${date}`);
  return rows.map(toMatch);
}

// ONE request: API-Football's own prediction for one game (win/draw/loss %, advice, goals hint, last-5 form, h2h).
export async function fetchPrediction(fixtureId: number): Promise<Json | null> {
  const rows = await apiFetch<Json[]>(`/predictions?fixture=${fixtureId}`);
  return rows?.[0] ?? null;
}
