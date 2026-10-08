// Predictz scraper -- CONFIRMED against real fetched content (2026-10-07,
// via the /admin/scrape-status diagnostic page). Two independent patterns
// zipped together by index, since the two pieces of info we need appear
// in different places in the page for each match, not combined in one
// spot:
//   1. "<Home|Draw|Away> <score> MATCH PREVIEW" -- Predictz's own
//      predicted outcome + correct score, once per match.
//   2. "<HomeTeam> v <AwayTeam> ... 1 X 2 <odds> <odds> <odds>" -- the
//      team matchup with real decimal 1X2 odds. (Each match's teams
//      appear TWICE in the raw text -- once in a collapsed summary with
//      no odds following, once in the expanded detail with odds. The
//      regex's WDL-form-letter cap before "1 X 2" means it only matches
//      the odds-anchored occurrence, naturally skipping the bare one.)
// These two patterns are assumed to appear in the same relative order
// per match (true in all content inspected so far) -- if their counts
// ever differ, that assumption has broken and needs re-checking; logged
// rather than silently mismatched.

import { fetchAndStripViaZenRows } from './zenrows';
import type { PredictedScore } from './scoreToMarkets';

export interface PredictzPrediction {
  homeTeam: string;
  awayTeam: string;
  predictedScore: PredictedScore | null;
  oddsHome: number | null;
  oddsDraw: number | null;
  oddsAway: number | null;
}

const SCORE_PATTERN = /(Home|Draw|Away)\s+(\d+)-(\d+)\s+MATCH PREVIEW/g;
const MATCH_ODDS_PATTERN =
  /([A-Z][A-Za-z0-9.'\s-]{2,40}?)\s+v\s+([A-Z][A-Za-z0-9.'\s-]{2,40}?)\s+(?:[WDL\s]{0,20})?1\s+X\s+2\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)/g;

function buildPredictzUrl(daysAhead: number): string {
  if (daysAhead <= 0) return 'https://www.predictz.com/predictions/';
  if (daysAhead === 1) return 'https://www.predictz.com/predictions/tomorrow/';
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  const yyyymmdd = d.toISOString().slice(0, 10).replace(/-/g, '');
  return `https://www.predictz.com/predictions/${yyyymmdd}/`;
}

// Raw, unparsed text -- kept for the diagnostic page / re-verifying the
// pattern still holds if Predictz changes its layout later.
export async function fetchPredictzRawText(daysAhead = 0): Promise<string | null> {
  return fetchAndStripViaZenRows(buildPredictzUrl(daysAhead), { jsRender: true, premiumProxy: true });
}

export async function fetchPredictzPredictions(daysAhead = 0): Promise<PredictzPrediction[]> {
  const text = await fetchPredictzRawText(daysAhead);
  if (!text) {
    console.error('[predictz] fetch failed');
    return [];
  }

  const scorePreds: { home: number; away: number }[] = [];
  SCORE_PATTERN.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = SCORE_PATTERN.exec(text)) !== null) {
    scorePreds.push({ home: parseInt(m[2], 10), away: parseInt(m[3], 10) });
  }

  const matchOdds: { homeTeam: string; awayTeam: string; oddsHome: number; oddsDraw: number; oddsAway: number }[] = [];
  MATCH_ODDS_PATTERN.lastIndex = 0;
  while ((m = MATCH_ODDS_PATTERN.exec(text)) !== null) {
    matchOdds.push({
      homeTeam: m[1].trim(),
      awayTeam: m[2].trim(),
      oddsHome: parseFloat(m[3]),
      oddsDraw: parseFloat(m[4]),
      oddsAway: parseFloat(m[5]),
    });
  }

  if (scorePreds.length !== matchOdds.length) {
    console.error(
      `[predictz] pattern count mismatch: ${scorePreds.length} score predictions vs ${matchOdds.length} team/odds matches -- zipping by index anyway, results past the shorter count are dropped`,
    );
  }

  const count = Math.min(scorePreds.length, matchOdds.length);
  const predictions: PredictzPrediction[] = [];
  for (let i = 0; i < count; i++) {
    predictions.push({
      homeTeam: matchOdds[i].homeTeam,
      awayTeam: matchOdds[i].awayTeam,
      predictedScore: scorePreds[i],
      oddsHome: matchOdds[i].oddsHome,
      oddsDraw: matchOdds[i].oddsDraw,
      oddsAway: matchOdds[i].oddsAway,
    });
  }

  if (predictions.length === 0) {
    console.error('[predictz] parsed 0 predictions -- pattern may need re-checking against the current page layout');
  }

  return predictions;
}

