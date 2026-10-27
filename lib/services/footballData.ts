// football-data.org client -- primary fixture/results/team-form source.
// Free tier: 12 major competitions, 10 requests/minute, current season
// only, scores delayed (fine for our daily-batch use, not for live).
// Docs: https://docs.football-data.org/general/v4/

import type { TeamMatchResult } from './poissonModel';
import { lookupForm, type StoredResult } from './formHistory';

const BASE_URL = 'https://api.football-data.org/v4';

function getApiKey(): string {
  const key = process.env.FOOTBALL_DATA_API_KEY;
  if (!key) {
    throw new Error('FOOTBALL_DATA_API_KEY is not set -- sign up free at football-data.org to get one.');
  }
  return key;
}

async function fdFetch<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { 'X-Auth-Token': getApiKey() },
    // football-data.org data updates slowly; fine to let Next.js cache
    // this for a while rather than hitting the 10/min rate limit.
    next: { revalidate: 3600 },
  });

  if (res.status === 429) {
    throw new Error('football-data.org rate limit hit (10 req/min on free tier) -- back off and retry.');
  }
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`football-data.org request failed: ${res.status} ${body.slice(0, 300)}`);
  }
  return res.json() as Promise<T>;
}

export interface FdTeam {
  id: number;
  name: string;
  shortName: string;
}

export interface FdMatch {
  id: number;
  utcDate: string;
  status: 'SCHEDULED' | 'TIMED' | 'IN_PLAY' | 'PAUSED' | 'FINISHED' | 'POSTPONED' | 'CANCELLED';
  homeTeam: FdTeam;
  awayTeam: FdTeam;
  score: {
    fullTime: { home: number | null; away: number | null };
  };
  competition: { id: number; name: string };
}

// The 12 competitions available on the free tier.
export const FREE_TIER_COMPETITIONS = [
  'CL', 'PL', 'PD', 'BL1', 'SA', 'FL1', 'DED', 'PPL', 'ELC', 'BSA', 'WC', 'EC',
] as const;

export async function fetchUpcomingMatches(competitionCode: string, days = 2): Promise<FdMatch[]> {
  const dateFrom = new Date().toISOString().slice(0, 10);
  const dateTo = new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
  const data = await fdFetch<{ matches: FdMatch[] }>(
    `/competitions/${competitionCode}/matches?dateFrom=${dateFrom}&dateTo=${dateTo}&status=SCHEDULED`,
  );
  return data.matches;
}

// Global endpoint across all subscribed (free-tier: 12) competitions,
// rather than per-competition -- used for team-name matching, where we
// don't yet know which competition a decoded selection belongs to, and
// for the Predictor's daily fixture scan.
//
// No `competitions=` filter -- football-data.org's own docs confirm
// /v4/matches with no filter already defaults to "today's matches of
// your subscribed competitions" (dateFrom/dateTo still apply on top of
// that). An earlier version of this function passed competitions=PL,CL,...
// (string codes), which was wrong -- the API's own docs specify that
// filter takes numeric competition IDs, not codes -- and produced an
// empty result. Simpler to just omit it and rely on account scoping.
export async function fetchMatchesByDateRange(dateFrom: string, dateTo: string): Promise<FdMatch[]> {
  const data = await fdFetch<{ matches: FdMatch[] }>(`/matches?dateFrom=${dateFrom}&dateTo=${dateTo}`);
  return data.matches;
}

// Recent finished matches for a team, used to compute attack/defense
// strength. `limit` defaults to a reasonable form window -- more than
// this starts including form that's no longer very predictive.
export async function fetchTeamRecentForm(teamId: number, limit = 10, historyOnly = false): Promise<TeamMatchResult[]> {
  // Preferred: stored finished matches (one request fills ~9 days for every team). The per-team request below (10/min
  // on the free tier) is only for the Decoder while the history is not ready; historyOnly (the Predictor) never makes it.
  const stored = await lookupForm(teamId, limit, 'footballdata');
  if (stored) return stored;
  if (historyOnly) return [];
  return fetchTeamLastResults(teamId, limit);
}

// One request: the team's last finished matches (the top-up cron and the Decoder fallback both use this).
export async function fetchTeamLastResults(teamId: number, limit = 10): Promise<TeamMatchResult[]> {
  const data = await fdFetch<{ matches: FdMatch[] }>(
    `/teams/${teamId}/matches?status=FINISHED&limit=${limit}`,
  );

  return data.matches
    .filter((m) => m.score.fullTime.home !== null && m.score.fullTime.away !== null)
    .map((m) => {
      const isHome = m.homeTeam.id === teamId;
      const goalsFor = isHome ? m.score.fullTime.home! : m.score.fullTime.away!;
      const goalsAgainst = isHome ? m.score.fullTime.away! : m.score.fullTime.home!;
      return { goalsFor, goalsAgainst, isHome };
    });
}

// Finished matches of the 12 free competitions over a date range (max 10 days), grouped by UTC day as
// [homeTeamId, awayTeamId, homeGoals, awayGoals]. ONE request, instead of one per team.
export function bucketFinished(matches: FdMatch[], days: Set<string>): Map<string, StoredResult[]> {
  const byDay = new Map<string, StoredResult[]>();
  for (const m of matches) {
    if (m.status !== 'FINISHED' || m.score.fullTime.home == null || m.score.fullTime.away == null) continue;
    const day = m.utcDate.slice(0, 10);
    if (!days.has(day)) continue;
    const list = byDay.get(day) ?? [];
    list.push([m.homeTeam.id, m.awayTeam.id, m.score.fullTime.home, m.score.fullTime.away]);
    byDay.set(day, list);
  }
  return byDay;
}

export async function fetchFinishedRange(from: string, to: string): Promise<Map<string, StoredResult[]>> {
  const end = new Date(Date.parse(to) + 86400000).toISOString().slice(0, 10); // dateTo is exclusive of late kick-offs; one extra day, then filter by day
  const data = await fdFetch<{ matches: FdMatch[] }>(`/matches?dateFrom=${from}&dateTo=${end}&status=FINISHED`);
  const wanted = new Set<string>();
  for (let t = Date.parse(from); t <= Date.parse(to); t += 86400000) wanted.add(new Date(t).toISOString().slice(0, 10));
  return bucketFinished(data.matches, wanted);
}
