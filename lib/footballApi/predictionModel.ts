// Turns API-Football's saved /predictions reply into market probabilities, with OUR Poisson model.
// This is a SEPARATE source from the football-data.org (13 leagues) form: it is only reached when that path has
// no usable data for a game and a prediction was saved for it (see lib/predictor/probabilities.ts).
//
// What it reads from the saved reply (and nothing else; the API's own win % / advice are ignored):
//   A. season goals by venue:   home team's goals for/against AT HOME, away team's goals for/against AWAY  (weight 0.50)
//   B. last-5 goals:            each team's goals for/against average over its last 5 games               (weight 0.35)
//   C. head-to-head goals:      the last up-to-6 meetings, oriented to today's home/away teams            (weight 0.15 x n/6, needs 3+)
// Each source gives an expected-goals pair as (team's attack + opponent's defence) / 2. Weights of missing sources are
// dropped and the rest renormalised. The weights are a first guess, not tuned: back-test before trusting them.

import { buildScorelineMatrix, deriveMarketProbabilities } from '@/lib/services/poissonModel';
import type { MatchProbabilitiesData } from '@/lib/services/confidenceEngine';

type Json = Record<string, any>;

const WEIGHT_SEASON = 0.5;
const WEIGHT_LAST5 = 0.35;
const WEIGHT_H2H = 0.15;
const H2H_MAX = 6;
const H2H_MIN = 3;
const XG_MIN = 0.25;
const XG_MAX = 3.5;

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace('%', ''));
  return Number.isFinite(n) ? n : null;
};

interface Pair { home: number; away: number }

function seasonPair(h: Json, a: Json): Pair | null {
  const hFor = num(h?.league?.goals?.for?.average?.home);
  const hAgainst = num(h?.league?.goals?.against?.average?.home);
  const aFor = num(a?.league?.goals?.for?.average?.away);
  const aAgainst = num(a?.league?.goals?.against?.average?.away);
  const hPlayed = num(h?.league?.fixtures?.played?.home) ?? 0;
  const aPlayed = num(a?.league?.fixtures?.played?.away) ?? 0;
  if ([hFor, hAgainst, aFor, aAgainst].some((x) => x === null) || hPlayed < 2 || aPlayed < 2) return null;
  return { home: (hFor! + aAgainst!) / 2, away: (aFor! + hAgainst!) / 2 };
}

function last5Pair(h: Json, a: Json): Pair | null {
  const hFor = num(h?.last_5?.goals?.for?.average);
  const hAgainst = num(h?.last_5?.goals?.against?.average);
  const aFor = num(a?.last_5?.goals?.for?.average);
  const aAgainst = num(a?.last_5?.goals?.against?.average);
  if ([hFor, hAgainst, aFor, aAgainst].some((x) => x === null) || (num(h?.last_5?.played) ?? 0) < 3 || (num(a?.last_5?.played) ?? 0) < 3) return null;
  return { home: (hFor! + aAgainst!) / 2, away: (aFor! + hAgainst!) / 2 };
}

// h2h is newest first; each entry's own home/away may differ from today's, so orient by team id.
function h2hPair(h2h: Json[] | undefined, homeId: number, awayId: number): { pair: Pair; n: number } | null {
  const rows = (h2h ?? []).slice(0, H2H_MAX);
  let hg = 0;
  let ag = 0;
  let n = 0;
  for (const m of rows) {
    const gh = num(m?.goals?.home);
    const ga = num(m?.goals?.away);
    const mHome = num(m?.teams?.home?.id);
    if (gh === null || ga === null || mHome === null) continue;
    if (mHome === homeId) { hg += gh; ag += ga; } else if (mHome === awayId) { hg += ga; ag += gh; } else continue;
    n++;
  }
  return n >= H2H_MIN ? { pair: { home: hg / n, away: ag / n }, n } : null;
}

const clamp = (x: number) => Math.min(XG_MAX, Math.max(XG_MIN, x));

// Last 5 results of the season form string (the API lists the most recent last), as W/D/L.
const lastFive = (form: unknown): string => (typeof form === 'string' ? form.slice(-5) : '');

export function probabilitiesFromPrediction(
  data: Json | null | undefined,
  homeTeamId: number,
  awayTeamId: number,
  lines: number[],
): (MatchProbabilitiesData & { sources: string[]; homeXg: number; awayXg: number }) | null {
  const h = data?.teams?.home;
  const a = data?.teams?.away;
  if (!h || !a) return null;

  const parts: { w: number; p: Pair; name: string }[] = [];
  const s = seasonPair(h, a);
  if (s) parts.push({ w: WEIGHT_SEASON, p: s, name: 'season' });
  const l = last5Pair(h, a);
  if (l) parts.push({ w: WEIGHT_LAST5, p: l, name: 'last5' });
  const t = h2hPair(data?.h2h, homeTeamId, awayTeamId);
  if (t) parts.push({ w: WEIGHT_H2H * Math.min(1, t.n / H2H_MAX), p: t.pair, name: 'h2h' });
  // head-to-head alone is not enough to price a game
  if (!parts.some((x) => x.name !== 'h2h')) return null;

  const total = parts.reduce((sum, x) => sum + x.w, 0);
  const homeXg = clamp(parts.reduce((sum, x) => sum + x.w * x.p.home, 0) / total);
  const awayXg = clamp(parts.reduce((sum, x) => sum + x.w * x.p.away, 0) / total);

  return {
    probs: deriveMarketProbabilities(buildScorelineMatrix(homeXg, awayXg), lines),
    homeFormString: lastFive(h?.league?.form),
    awayFormString: lastFive(a?.league?.form),
    homeGoalsAvg: num(h?.last_5?.goals?.for?.average) ?? homeXg,
    awayGoalsAvg: num(a?.last_5?.goals?.for?.average) ?? awayXg,
    sources: parts.map((x) => x.name),
    homeXg,
    awayXg,
  };
}
