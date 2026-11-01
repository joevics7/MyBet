// Read side of the standalone football store. Features use THIS, never the API. Reads cost nothing.

import { getSupabaseAdmin } from '@/lib/supabase-admin';
import type { FdMatch } from '@/lib/services/footballData';
import type { TeamMatchResult } from '@/lib/services/poissonModel';
import { lookupForm } from '@/lib/services/formHistory';

// Compact row kept in football_day_fixtures.fixtures:
// [fixtureId, utcDate, status, homeId, homeName, awayId, awayName, leagueId, leagueName, homeGoals|null, awayGoals|null]
type Row = [number, string, FdMatch['status'], number, string, number, string, number, string, number | null, number | null];

const toRow = (m: FdMatch): Row => [
  m.id, m.utcDate, m.status, m.homeTeam.id, m.homeTeam.name, m.awayTeam.id, m.awayTeam.name,
  m.competition.id, m.competition.name, m.score.fullTime.home, m.score.fullTime.away,
];
const fromRow = (r: Row): FdMatch => ({
  id: r[0], utcDate: r[1], status: r[2],
  homeTeam: { id: r[3], name: r[4], shortName: r[4] },
  awayTeam: { id: r[5], name: r[6], shortName: r[6] },
  score: { fullTime: { home: r[9], away: r[10] } },
  competition: { id: r[7], name: r[8] },
});

export async function saveDayFixtures(day: string, matches: FdMatch[]): Promise<void> {
  const { error } = await getSupabaseAdmin()
    .from('football_day_fixtures')
    .upsert({ day, fixtures: matches.map(toRow), match_count: matches.length, fetched_at: new Date().toISOString() }, { onConflict: 'day' });
  if (error) throw new Error(error.message);
  cache.delete(day);
}

const cache = new Map<string, { at: number; data: FdMatch[] }>();
const TTL_MS = 5 * 60 * 1000;

async function loadDay(day: string): Promise<FdMatch[]> {
  const hit = cache.get(day);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.data;
  let data: FdMatch[] = [];
  try {
    const { data: row, error } = await getSupabaseAdmin().from('football_day_fixtures').select('fixtures').eq('day', day).maybeSingle();
    if (error) throw new Error(error.message);
    data = ((row?.fixtures as Row[] | undefined) ?? []).map(fromRow);
  } catch (err) {
    console.error('[footballApi store] could not read saved fixtures (table missing?):', err);
  }
  cache.set(day, { at: Date.now(), data });
  return data;
}

// Same shape as the providers' fetchMatchesByDateRange, but answered from the saved lists (no API request).
export async function getStoredFixtures(dateFrom: string, dateTo: string): Promise<FdMatch[]> {
  const days: string[] = [];
  for (let t = Date.parse(dateFrom); t <= Date.parse(dateTo) && days.length < 7; t += 86400000) days.push(new Date(t).toISOString().slice(0, 10));
  return (await Promise.all(days.map(loadDay))).flat();
}

// A team's saved last results (API-Football ids). Empty when the daily job hasn't saved this team: never fetches.
export async function storedTeamForm(teamId: number, limit = 10, _historyOnly?: boolean): Promise<TeamMatchResult[]> {
  return (await lookupForm(teamId, limit, 'apifootball')) ?? [];
}
