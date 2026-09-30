// football-data.org client -- primary fixture/results/team-form source.
// Free tier: 12 major competitions, 10 requests/minute, current season
// only, scores delayed (fine for our daily-batch use, not for live).
// Docs: https://docs.football-data.org/general/v4/

import type { TeamMatchResult } from './poissonModel';

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
// don't yet know which competition a decoded selection belongs to.
export async function fetchMatchesByDateRange(dateFrom: string, dateTo: string): Promise<FdMatch[]> {
  const data = await fdFetch<{ matches: FdMatch[] }>(`/matches?dateFrom=${dateFrom}&dateTo=${dateTo}`);
  return data.matches;
}

// Recent finished matches for a team, used to compute attack/defense
// strength. `limit` defaults to a reasonable form window -- more than
// this starts including form that's no longer very predictive.
export async function fetchTeamRecentForm(teamId: number, limit = 10): Promise<TeamMatchResult[]> {
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
