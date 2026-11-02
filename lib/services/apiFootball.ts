// API-Football (api-sports.io): THIN CLIENT. Nothing in the app imports this except lib/footballApi/jobs.ts, which is the
// only code allowed to spend requests (the daily job and the score job, both capped by lib/footballApi/budget.ts).
// Everything else reads what those jobs saved (lib/footballApi/store.ts). Docs: https://www.api-football.com/documentation-v3
//
// Env: API_FOOTBALL_KEY. Plan: free = 100 requests/day.

import type { TeamMatchResult } from './poissonModel';
import type { FdMatch } from './footballData';

const BASE_URL = 'https://v3.football.api-sports.io';

// A suspended account or an exhausted quota answers every call with an error: stop calling until it can work again.
let blockedUntil = 0; // epoch ms
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
    blockedUntil = nextUtcMidnight();
    throw new Error('API-Football rate limit hit.');
  }
  if (!res.ok) throw new Error(`API-Football request failed: ${res.status} ${(await res.text()).slice(0, 200)}`);

  const json = (await res.json()) as Json;
  const errs = json.errors;
  const hasErrors = Array.isArray(errs) ? errs.length > 0 : errs && Object.keys(errs).length > 0;
  if (hasErrors) {
    const text = JSON.stringify(errs);
    if (/suspended/i.test(text)) blockedUntil = Date.now() + 6 * 3600e3;
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

// ONE request: a team's last finished matches.
export async function fetchTeamLastResults(teamId: number, limit = 10): Promise<TeamMatchResult[]> {
  const rows = await apiFetch<Json[]>(`/fixtures?team=${teamId}&last=${limit}`);
  return rows
    .map(toMatch)
    .filter((m) => m.status === 'FINISHED' && m.score.fullTime.home !== null && m.score.fullTime.away !== null)
    .map((m) => {
      const isHome = m.homeTeam.id === teamId;
      return {
        goalsFor: isHome ? m.score.fullTime.home! : m.score.fullTime.away!,
        goalsAgainst: isHome ? m.score.fullTime.away! : m.score.fullTime.home!,
        isHome,
      };
    });
}

// ONE request to any path, returning the plan's answer instead of throwing (used only by the probe job).
export async function probeApi(path: string): Promise<{ ok: boolean; results?: number; sample?: unknown; error?: string }> {
  try {
    const rows = await apiFetch<Json[]>(path);
    return { ok: true, results: Array.isArray(rows) ? rows.length : undefined, sample: Array.isArray(rows) ? rows[0] : rows };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
