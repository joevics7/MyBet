// Team-name matcher -- connects a decoded selection's team names (free
// text from a betting platform, e.g. "Equatorial Guinea v Sierra Leone")
// to football-data.org's own team records. There's no shared ID between
// a betting platform and a stats provider, so this is necessarily fuzzy:
// normalize both sides, then compare against every fixture on the same
// date rather than trying to search by name directly (a much smaller,
// much more reliable search space).
//
// IMPORTANT LIMITATION: football-data.org's free tier only covers 12
// major competitions (top European leagues, WC/EC). A large share of
// what platforms like SportyBet/Bet9ja decode -- lower-division matches,
// most international qualifiers outside WC/EC, South American leagues
// below the top flight -- simply won't be in football-data.org's data at
// all. findFixtureByTeamNames() returning null is the expected, common
// case for those, not a bug. This needs a second data source (API-Football
// or similar) eventually to raise coverage; this module doesn't attempt
// that yet.

import { fetchMatchesByDateRange, type FdMatch } from './footballData';

function normalizeTeamName(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // strip accents
    .replace(/\b(fc|cf|sc|afc|cfc|ca|ac|ud|cd|if|bk|fk|sd|srl|rc)\b/g, '')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function bigrams(s: string): Set<string> {
  const padded = ` ${s} `;
  const grams = new Set<string>();
  for (let i = 0; i < padded.length - 1; i++) grams.add(padded.slice(i, i + 2));
  return grams;
}

// Dice coefficient on character bigrams -- simple, dependency-free, and
// tolerant of the kind of small spelling/formatting differences expected
// between two independent sources naming the same team.
function similarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const setA = bigrams(a);
  const setB = bigrams(b);
  let overlap = 0;
  Array.from(setA).forEach((gram) => {
    if (setB.has(gram)) overlap++;
  });
  return (2 * overlap) / (setA.size + setB.size);
}

// Both home and away must individually clear this bar -- a great match on
// one side doesn't compensate for a bad match on the other, since that's
// almost certainly the wrong fixture entirely, not a naming quirk.
const PER_TEAM_THRESHOLD = 0.55;

export interface MatchedFixture {
  matchId: number;
  homeTeamId: number;
  awayTeamId: number;
  homeTeamName: string;  // football-data.org's own name, not the input
  awayTeamName: string;
  competitionName: string;
  confidence: number;    // 0-1, average of both teams' similarity scores
}

export async function findFixtureByTeamNames(
  homeTeamName: string,
  awayTeamName: string,
  kickoffAt: string | null,
): Promise<MatchedFixture | null> {
  if (!kickoffAt) return null;

  const kickoffDate = new Date(kickoffAt);
  if (Number.isNaN(kickoffDate.getTime())) return null;

  // +/- 1 day around kickoff, mainly to absorb UTC-vs-local date edge
  // cases near midnight rather than genuine date uncertainty.
  const dateFrom = new Date(kickoffDate.getTime() - 86400000).toISOString().slice(0, 10);
  const dateTo = new Date(kickoffDate.getTime() + 86400000).toISOString().slice(0, 10);

  let candidates: FdMatch[];
  try {
    candidates = await fetchMatchesByDateRange(dateFrom, dateTo);
  } catch (err) {
    console.error('[teamMatcher] fetchMatchesByDateRange failed:', err);
    return null;
  }

  const targetHome = normalizeTeamName(homeTeamName);
  const targetAway = normalizeTeamName(awayTeamName);

  let best: { match: FdMatch; score: number } | null = null;

  for (const match of candidates) {
    const homeScore = similarity(targetHome, normalizeTeamName(match.homeTeam.name));
    const awayScore = similarity(targetAway, normalizeTeamName(match.awayTeam.name));

    if (homeScore < PER_TEAM_THRESHOLD || awayScore < PER_TEAM_THRESHOLD) continue;

    const combined = (homeScore + awayScore) / 2;
    if (!best || combined > best.score) best = { match, score: combined };
  }

  if (!best) return null;

  return {
    matchId: best.match.id,
    homeTeamId: best.match.homeTeam.id,
    awayTeamId: best.match.awayTeam.id,
    homeTeamName: best.match.homeTeam.name,
    awayTeamName: best.match.awayTeam.name,
    competitionName: best.match.competition.name,
    confidence: best.score,
  };
}
