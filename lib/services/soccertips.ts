// SoccerTips.co.za scraper -- plain server-side fetch, NO ZenRows needed (checked 2026-10-17).
//
// The page is the "Win Draw Win" market list for TODAY. After tag-stripping, each match reads:
//   [ordinal. League name]  Home Team vs Away Team  Bet Now  Home 2 - 1  [1 1.80 X 3.00 2 4.80]  View Analysis and more Tips
// The league name only appears before the FIRST match of each league, glued onto the home team
// ("1. Italy Serie A Bologna vs Inter Milan"), which is why team names need Gemini to split cleanly.
// The score is exact via regex: "Home|Draw|Away  H - A" with the HOME team's goals first
// ("Away 1 - 2" = home 1, away 2). Many lower-league rows are plain "Draw 1 - 1" / "Home 2 - 1" defaults,
// so this is the weakest of the four sources -- weight it accordingly later.
//
// Only today's page is fetched here. The tomorrow page has not been inspected yet.

import { stripHtml } from './zenrows';
import type { PredictedScore } from './scoreToMarkets';
import { geminiExtractChunked } from './tipsterAi';

const SOCCERTIPS_URL = 'https://soccertips.co.za/markets/win-draw-win-tips/';
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

export interface SoccerTipsPrediction {
  homeTeam: string;
  awayTeam: string;
  predictedScore: PredictedScore;
}

export interface SoccerTipsDiagnostics {
  matchBlocks: number; // "Bet Now ... Home|Draw|Away H - A" blocks found
  aiReturned: number;
  aiRejected: number;
  scoreMismatches: number; // Gemini score != regex score (regex wins)
  aiError: string | null;
}

export interface SoccerTipsResult {
  textLength: number | null;
  predictions: SoccerTipsPrediction[];
  diagnostics: SoccerTipsDiagnostics;
  error: string | null;
  sampleBlocks: string[];
}

const RESULT_PATTERN = /Bet Now\s+(Home|Away|Draw)\s+(\d{1,2})\s*-\s*(\d{1,2})/i;
const SPLIT_MARKER = /View Analysis and more Tips/gi;
const LEAD_CHARS = 170; // enough text before "Bet Now" to hold "[1. League] Home vs Away"

interface Block {
  index: number;
  before: string; // text before "Bet Now": optional league + "Home vs Away"
  homeScore: number;
  awayScore: number;
  outcome: string;
}

// Exported for tests.
export function extractBlocks(text: string): Block[] {
  const blocks: Block[] = [];
  const chunks = text.split(SPLIT_MARKER);
  chunks.forEach((c) => {
    const m = c.match(RESULT_PATTERN);
    const betNow = c.search(/Bet Now/i);
    if (!m || betNow < 0) return;
    const before = c.slice(Math.max(0, betNow - LEAD_CHARS), betNow).trim();
    if (!/\svs\s/i.test(before)) return;
    blocks.push({ index: blocks.length, before, homeScore: parseInt(m[2], 10), awayScore: parseInt(m[3], 10), outcome: m[1] });
  });
  return blocks;
}

export async function fetchSoccerTipsPredictions(): Promise<SoccerTipsResult> {
  const diag: SoccerTipsDiagnostics = { matchBlocks: 0, aiReturned: 0, aiRejected: 0, scoreMismatches: 0, aiError: null };

  let html: string;
  try {
    const res = await fetch(SOCCERTIPS_URL, {
      headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml', 'Accept-Language': 'en' },
      signal: AbortSignal.timeout(15000),
      cache: 'no-store',
    });
    if (!res.ok) {
      console.error('[soccertips] non-OK response:', res.status);
      return { textLength: null, predictions: [], diagnostics: diag, error: `HTTP ${res.status}`, sampleBlocks: [] };
    }
    html = await res.text();
  } catch (err) {
    console.error('[soccertips] fetch threw:', err);
    return { textLength: null, predictions: [], diagnostics: diag, error: String(err), sampleBlocks: [] };
  }

  const text = stripHtml(html);
  const blocks = extractBlocks(text);
  diag.matchBlocks = blocks.length;

  const line = (b: Block) => `${b.index} | ${b.before} || ${b.outcome} ${b.homeScore} - ${b.awayScore}`;
  const checkMap = new Map(blocks.map((b) => [String(b.index), b.before]));

  const ai = await geminiExtractChunked(blocks.map(line), 150, (lines) => ({
    source: 'soccertips',
    instructions:
      `Each input line is "index | text before | predicted score". The text before is: an optional ordinal like "1." and an optional ` +
      `league/country name (e.g. "Italy Serie A", "2. Bundesliga", "Prva Liga"), then "Home Team vs Away Team". The league name, when ` +
      `present, is glued directly in front of the home team -- do not include it in home_team. Return only the two team names.`,
    input: lines.join('\n'),
    checkSource: checkMap,
    allowedIds: new Set(blocks.map((b) => String(b.index))),
    maxOutputTokens: 16000,
  }));
  diag.aiReturned = ai.returned;
  diag.aiRejected = ai.rejected;
  diag.aiError = ai.error;

  const predictions: SoccerTipsPrediction[] = [];
  for (const a of ai.rows) {
    const b = blocks[Number(a.id)];
    if (!b) continue;
    if (a.homeScore !== b.homeScore || a.awayScore !== b.awayScore) diag.scoreMismatches++;
    predictions.push({ homeTeam: a.homeTeam, awayTeam: a.awayTeam, predictedScore: { home: b.homeScore, away: b.awayScore } }); // regex score is exact
  }

  if (predictions.length === 0) console.error('[soccertips] parsed 0 predictions -- check GEMINI_API_KEY and the page layout');
  return { textLength: text.length, predictions, diagnostics: diag, error: null, sampleBlocks: blocks.slice(0, 6).map(line) };
}
