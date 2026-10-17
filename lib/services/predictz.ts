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

// 2026-10-17 UPDATE: the two-regex zip below is fragile (any extra/missing match on the page shifts every
// later score onto the wrong team, and the only symptom is a log line). Gemini is now the PRIMARY parser:
// it reads the stripped page and pairs each predicted score with its match using the surrounding text.
// Every Gemini row is validated -- both team names must appear in the page text, and the score must be
// one of the "<Home|Draw|Away> N-N MATCH PREVIEW" scores actually on the page. The regex parser is kept
// as the fallback (no API key / Gemini failed / 0 valid rows) and as a cross-check shown on the
// /admin/scrape-status page. Odds are no longer extracted: the confidence calculation is score-only.

import { fetchAndStripViaZenRows } from './zenrows';
import type { PredictedScore } from './scoreToMarkets';
import { geminiExtractMatches } from './tipsterAi';

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

function parsePredictzTextRegex(text: string): PredictzPrediction[] {
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
      `[predictz] regex pattern count mismatch: ${scorePreds.length} score predictions vs ${matchOdds.length} team/odds matches -- zipping by index anyway, results past the shorter count are dropped`,
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
  return predictions;
}

export interface PredictzDiagnostics {
  method: 'ai' | 'regex' | 'none';
  previewScoreTokens: number; // "<Home|Draw|Away> N-N MATCH PREVIEW" tokens found in the text
  regexPairs: number; // team/odds matches found by the old regex
  regexCount: number; // predictions the old regex+zip produced
  aiReturned: number;
  aiRejected: number;
  aiValid: number;
  aiError: string | null;
}

const MAX_AI_INPUT_CHARS = 600_000; // far inside the model's context window

async function parsePredictzWithAi(text: string, previewScores: Set<string>): Promise<{ predictions: PredictzPrediction[]; returned: number; rejected: number; error: string | null }> {
  const ai = await geminiExtractMatches({
    source: 'predictz',
    instructions:
      `The input is the tag-stripped text of predictz.com's daily football predictions page. A token like ` +
      `"Home 2-1 MATCH PREVIEW" (or "Away 0-2 ...", "Draw 1-1 ...") is Predictz's own predicted outcome and correct score, home goals first. ` +
      `Matches are written as "HomeTeam v AwayTeam", often with recent form letters (W/D/L) and 1X2 odds nearby. Each match can appear more than ` +
      `once on the page (a collapsed summary and an expanded section) -- return each match ONCE. Pair every predicted score with the correct ` +
      `match using the surrounding text; if you cannot be sure which match a score belongs to, skip that match rather than guess.`,
    input: text.slice(0, MAX_AI_INPUT_CHARS),
    checkSource: text,
    // the score must be one that is really printed on the page as a MATCH PREVIEW score
    // (skipped when the page has no such tokens at all -- then the wording changed, which is exactly the case AI is here for;
    //  the diagnostics show previewScoreTokens = 0 so it is visible)
    scoreCheck: previewScores.size > 0 ? (h, a) => previewScores.has(`${h}-${a}`) : undefined,
    maxOutputTokens: 32000,
    timeoutMs: 40000,
  });

  return {
    predictions: ai.rows.map((r) => ({
      homeTeam: r.homeTeam,
      awayTeam: r.awayTeam,
      predictedScore: { home: r.homeScore, away: r.awayScore },
      oddsHome: null,
      oddsDraw: null,
      oddsAway: null,
    })),
    returned: ai.returned,
    rejected: ai.rejected,
    error: ai.error,
  };
}

async function parsePredictzText(text: string): Promise<{ predictions: PredictzPrediction[]; diagnostics: PredictzDiagnostics }> {
  const previewScores = new Set<string>();
  let previewScoreTokens = 0;
  SCORE_PATTERN.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = SCORE_PATTERN.exec(text)) !== null) {
    previewScoreTokens++;
    previewScores.add(`${parseInt(m[2], 10)}-${parseInt(m[3], 10)}`);
  }
  MATCH_ODDS_PATTERN.lastIndex = 0;
  let regexPairs = 0;
  while (MATCH_ODDS_PATTERN.exec(text) !== null) regexPairs++;

  const regexPredictions = parsePredictzTextRegex(text);
  const ai = await parsePredictzWithAi(text, previewScores);

  const diagnostics: PredictzDiagnostics = {
    method: 'none',
    previewScoreTokens,
    regexPairs,
    regexCount: regexPredictions.length,
    aiReturned: ai.returned,
    aiRejected: ai.rejected,
    aiValid: ai.predictions.length,
    aiError: ai.error,
  };

  if (ai.predictions.length > 0) {
    diagnostics.method = 'ai';
    return { predictions: ai.predictions, diagnostics };
  }
  if (regexPredictions.length > 0) {
    diagnostics.method = 'regex';
    return { predictions: regexPredictions, diagnostics };
  }

  console.error('[predictz] parsed 0 predictions by AI and by regex -- check the raw text on /admin/scrape-status');
  return { predictions: [], diagnostics };
}

// Fetches ONCE and returns the raw text, the parsed result and diagnostics -- the diagnostic page uses
// this so it can show all of them without burning a second ZenRows request (credits are a real
// constraint on the free tier, and a 0-result day is ambiguous between "genuinely no matches" and
// "ZenRows returned something other than the real page"; raw text is the only way to tell them apart).
export async function fetchPredictzWithRaw(
  daysAhead = 0,
): Promise<{ rawText: string | null; predictions: PredictzPrediction[]; diagnostics: PredictzDiagnostics | null }> {
  const rawText = await fetchAndStripViaZenRows(buildPredictzUrl(daysAhead), { jsRender: true, premiumProxy: true });
  if (!rawText) {
    console.error('[predictz] fetch failed -- ZenRows returned nothing (check credits/API key/Vercel logs for the specific error)');
    return { rawText: null, predictions: [], diagnostics: null };
  }
  const { predictions, diagnostics } = await parsePredictzText(rawText);
  return { rawText, predictions, diagnostics };
}

// Thin wrappers for callers that only need one or the other.
export async function fetchPredictzRawText(daysAhead = 0): Promise<string | null> {
  return (await fetchPredictzWithRaw(daysAhead)).rawText;
}

export async function fetchPredictzPredictions(daysAhead = 0): Promise<PredictzPrediction[]> {
  return (await fetchPredictzWithRaw(daysAhead)).predictions;
}
