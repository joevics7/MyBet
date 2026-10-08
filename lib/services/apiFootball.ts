// API-Football (api-sports.io) client -- wide-coverage fixture/results/form
// source (1,000+ leagues and cups incl. international competitions), used
// ahead of football-data.org's 12-competition free tier.
// Docs: https://www.api-football.com/documentation-v3
//
// Env: API_FOOTBALL_KEY (direct api-sports.io dashboard key).
// Quota: free = 100 req/day, Pro = 7,500 req/day. Every call counts, so:
//  - fixtures are fetched ONE REQUEST PER DATE (all leagues) and cached,
//    which serves every selection on that date from a single call
//  - team form is cached per team
// Returns the same shape as footballData.ts (FdMatch / TeamMatchResult) so
// the matcher and engine don't care which provider supplied the data.

import type { TeamMatchResult } from './poissonModel';
import type { FdMatch } from './footballData';

const BASE_URL = 'https://v3.football.api-sports.io';

export function isApiFootballConfigured(): boolean {
  return !!process.env.API_FOOTBALL_KEY;
}

type Json = Record<string, any>;

// API-Football reports many failures (bad key, quota, bad params) as HTTP 200
// with a non-empty `errors` field, so res.ok alone isn't enough.
async function apiFetch<T = Json[]>(path: string, revalidate: number): Promise<T> {
  const key = process.env.API_FOOTBALL_KEY;
  if (!key) throw new Error('API_FOOTBALL_KEY is not set.');

  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { 'x-apisports-key': key },
    next: { revalidate },
  });
  if (res.status === 429) throw new Error('API-Football rate limit hit.');
  if (!res.ok) throw new Error(`API-Football request failed: ${res.status} ${(await res.text()).slice(0, 200)}`);

  const json = (await res.json()) as Json;
  const errs = json.errors;
  const hasErrors = Array.isArray(errs) ? errs.length > 0 : errs && Object.keys(errs).length > 0;
  if (hasErrors) throw new Error(`API-Football error: ${JSON.stringify(errs).slice(0, 300)}`);

  const remaining = res.headers.get('x-ratelimit-requests-remaining');
  if (remaining !== null && Number(remaining) < 10) {
    console.warn(`[apiFootball] only ${remaining} requests left today`);
  }
  return json.response as T;
}

// Short status codes -> the status vocabulary the rest of the app already uses.
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
    // 90-minute score when available -- the Poisson model is a 90-minute model.
    score: {
      fullTime: {
        home: f.score?.fulltime?.home ?? f.goals?.home ?? null,
        away: f.score?.fulltime?.away ?? f.goals?.away ?? null,
      },
    },
    competition: { id: f.league.id, name: f.league.name },
  };
}

// In-process cache (survives within a warm serverless instance) on top of
// Next's fetch cache, so a slip with 10 legs on one date costs 1 request.
const dateCache = new Map<string, { at: number; data: FdMatch[] }>();
const DATE_TTL_MS = 30 * 60 * 1000;

async function fetchDate(date: string): Promise<FdMatch[]> {
  const hit = dateCache.get(date);
  if (hit && Date.now() - hit.at < DATE_TTL_MS) return hit.data;
  const rows = await apiFetch<Json[]>(`/fixtures?date=${date}`, 1800);
  const data = rows.map(toMatch);
  dateCache.set(date, { at: Date.now(), data });
  return data;
}

// Mirrors footballData.fetchMatchesByDateRange. One request per calendar day.
export async function fetchMatchesByDateRange(dateFrom: string, dateTo: string): Promise<FdMatch[]> {
  const days: string[] = [];
  for (let t = Date.parse(dateFrom); t <= Date.parse(dateTo) && days.length < 7; t += 86400000) {
    days.push(new Date(t).toISOString().slice(0, 10));
  }
  const perDay = await Promise.all(days.map(fetchDate));
  return perDay.flat();
}

const formCache = new Map<number, { at: number; data: TeamMatchResult[] }>();
const FORM_TTL_MS = 6 * 60 * 60 * 1000;

// Mirrors footballData.fetchTeamRecentForm.
export async function fetchTeamRecentForm(teamId: number, limit = 10): Promise<TeamMatchResult[]> {
  const hit = formCache.get(teamId);
  if (hit && Date.now() - hit.at < FORM_TTL_MS) return hit.data.slice(0, limit);

  const rows = await apiFetch<Json[]>(`/fixtures?team=${teamId}&last=${limit}`, 21600);
  const data = rows
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
  formCache.set(teamId, { at: Date.now(), data });
  return data;
}
