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

import type { PredictedScore } from './scoreToMarkets';
import { geminiExtractChunked } from './tipsterAi';

// Like stripHtml but block-level tags become line breaks, so the league heading and the "Home vs Away" line
// stay on separate lines (the markdown view of the page showed them as separate elements). That makes the
// rule-based team split below possible without AI.
export function stripHtmlLines(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/?(?:p|div|li|ul|ol|h[1-6]|tr|table|section|article|header|footer|nav|main)\b[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#0?39;|&#8217;|&rsquo;/g, "'")
    .split('\n')
    .map((l) => l.replace(/[ \t]+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');
}

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
  namesFromAi: number;
  namesFromRule: number; // used when Gemini failed or was rejected -- check these for a league name glued onto the home team
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
  ruleHome: string; // rule-based split of the last "X vs Y" line (no AI)
  ruleAway: string;
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
    const teamsLine = before.split('\n').map((l) => l.trim()).filter((l) => /\svs\s/i.test(l)).pop() ?? '';
    const tm = teamsLine.match(/^(.*?)\s+vs\s+(.*)$/i);
    blocks.push({ index: blocks.length, before, ruleHome: tm?.[1].trim() ?? '', ruleAway: tm?.[2].trim() ?? '', homeScore: parseInt(m[2], 10), awayScore: parseInt(m[3], 10), outcome: m[1] });
  });
  return blocks;
}

export async function fetchSoccerTipsPredictions(): Promise<SoccerTipsResult> {
  const diag: SoccerTipsDiagnostics = { matchBlocks: 0, aiReturned: 0, aiRejected: 0, scoreMismatches: 0, aiError: null, namesFromAi: 0, namesFromRule: 0 };

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

  const text = stripHtmlLines(html);
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
    timeoutMs: 20000, // the rule-based split below is the fallback, so do not wait long on Gemini
  }));
  diag.aiReturned = ai.returned;
  diag.aiRejected = ai.rejected;
  diag.aiError = ai.error;

  // Gemini's names when they validated; otherwise the rule-based split. The score is always the regex one (exact).
  const aiByIndex = new Map(ai.rows.filter((r) => r.id !== null).map((r) => [Number(r.id), r]));
  const predictions: SoccerTipsPrediction[] = [];
  for (const b of blocks) {
    const a = aiByIndex.get(b.index);
    if (a && (a.homeScore !== b.homeScore || a.awayScore !== b.awayScore)) diag.scoreMismatches++;
    const home = a ? a.homeTeam : b.ruleHome;
    const away = a ? a.awayTeam : b.ruleAway;
    if (!home || !away) continue;
    if (a) diag.namesFromAi++;
    else diag.namesFromRule++;
    predictions.push({ homeTeam: home, awayTeam: away, predictedScore: { home: b.homeScore, away: b.awayScore } });
  }

  if (predictions.length === 0) console.error('[soccertips] parsed 0 predictions -- page layout may have changed');
  return { textLength: text.length, predictions, diagnostics: diag, error: null, sampleBlocks: blocks.slice(0, 6).map(line) };
}
