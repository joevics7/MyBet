// Vitibet scraper -- plain server-side fetch, NO ZenRows needed (checked 2026-10-17: the page comes
// back as normal HTML with every match's predicted score in it).
//
// Each match row on the page is a link whose URL carries Vitibet's own `fixture_id` / `league_id`.
// Those look like API-Football ids (team logos are served from media.api-sports.io), which, if
// confirmed, lets this source be matched to API-Football fixtures by id instead of by fuzzy names.
// That is NOT assumed anywhere yet -- `fixtureId` is only stored, and the diagnostic page shows it.
//
// Row text looks like: "13:30 Everton 1 : 1 Chelsea 10"
//   kickoff time, home team, predicted home goals ":" predicted away goals, away team, then a short
//   tip code (1, 2, 10, 02 or "-") glued on after the away team that is NOT part of its name.
//   Matches without a prediction show "? : ?" and are skipped.
//
// Two parsers run side by side:
//   - a RULE parser (regex): exact for the score, and a best-effort split of the names
//   - Gemini: cleans the names (team names can end in digits, e.g. "Rapid Psáry 2")
// The score always comes from the rule parser when it matched (it is exact); Gemini's names are used
// when they validate against the row text. Disagreements are counted and sampled for the diagnostic page.

import { stripHtml } from './zenrows';
import type { PredictedScore } from './scoreToMarkets';
import { geminiExtractChunked, normalizeForCheck } from './tipsterAi';

const VITIBET_URL = 'https://www.vitibet.com/index.php';
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

export interface VitibetPrediction {
  fixtureId: string;
  leagueId: string | null;
  homeTeam: string;
  awayTeam: string;
  predictedScore: PredictedScore;
}

export interface VitibetDiagnostics {
  linkRows: number; // distinct fixture links found in the HTML
  rowsWithScore: number; // of those, rows that carry a "x : y" prediction
  ruleParsed: number; // rows the regex parser could split
  aiReturned: number;
  aiRejected: number; // failed validation against the row text
  aiUsed: number; // predictions whose names came from Gemini
  scoreMismatches: number; // Gemini score != regex score (regex wins)
  nameDiffs: number; // Gemini names differ from the regex split
  nameDiffSamples: string[];
  aiError: string | null;
}

export interface VitibetResult {
  htmlLength: number | null;
  predictions: VitibetPrediction[];
  diagnostics: VitibetDiagnostics;
  error: string | null;
  sampleRows: string[]; // first few raw row texts, for eyeballing on the diagnostic page
}

const LINK_PATTERN = /<a\b[^>]*?href=["']([^"']*?fixture_id=(\d+)[^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;
const LEADING_TIME = /^\s*(?:Today\s*)?\d{1,2}:\d{2}\s*/i;
const LOOSE_SCORE = /\b\d{1,2}\s*:\s*\d{1,2}\b/;

interface RuleRow {
  home: string;
  away: string;
  homeScore: number;
  awayScore: number;
}

// Exported for tests. Lazy home-team match means "Super Nova 2 0 : 4 Metta / LU 2" splits at "0 : 4".
export function ruleParseRow(text: string): RuleRow | null {
  const t = text.replace(LEADING_TIME, '');
  const m = t.match(/^(.*?)\s+(\d{1,2})\s*:\s*(\d{1,2})\s+(.*)$/);
  if (!m) return null;
  const away = m[4].replace(/\s+(?:\d{1,2}|-)\s*$/, '').trim();
  const home = m[1].trim();
  if (!home || !away) return null;
  return { home, away, homeScore: parseInt(m[2], 10), awayScore: parseInt(m[3], 10) };
}

interface LinkRow {
  fixtureId: string;
  leagueId: string | null;
  text: string;
}

function extractRows(html: string): LinkRow[] {
  const byFixture = new Map<string, LinkRow>();
  LINK_PATTERN.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = LINK_PATTERN.exec(html)) !== null) {
    const href = m[1];
    const fixtureId = m[2];
    const text = stripHtml(m[3]);
    const leagueId = href.match(/league_id=(\d+)/)?.[1] ?? null;
    const hasScore = LOOSE_SCORE.test(text.replace(LEADING_TIME, ''));
    const existing = byFixture.get(fixtureId);
    // The same fixture is linked from several sections (tickets, community picks); keep the row that has a score.
    if (!existing || (hasScore && !LOOSE_SCORE.test(existing.text.replace(LEADING_TIME, '')))) {
      byFixture.set(fixtureId, { fixtureId, leagueId, text });
    }
  }
  return Array.from(byFixture.values());
}

export async function fetchVitibetPredictions(): Promise<VitibetResult> {
  const empty: VitibetDiagnostics = {
    linkRows: 0, rowsWithScore: 0, ruleParsed: 0, aiReturned: 0, aiRejected: 0, aiUsed: 0,
    scoreMismatches: 0, nameDiffs: 0, nameDiffSamples: [], aiError: null,
  };

  let html: string;
  try {
    const res = await fetch(VITIBET_URL, {
      headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml', 'Accept-Language': 'en' },
      signal: AbortSignal.timeout(15000),
      cache: 'no-store',
    });
    if (!res.ok) {
      console.error('[vitibet] non-OK response:', res.status);
      return { htmlLength: null, predictions: [], diagnostics: empty, error: `HTTP ${res.status}`, sampleRows: [] };
    }
    html = await res.text();
  } catch (err) {
    console.error('[vitibet] fetch threw:', err);
    return { htmlLength: null, predictions: [], diagnostics: empty, error: String(err), sampleRows: [] };
  }

  const allRows = extractRows(html);
  const scored = allRows.filter((r) => LOOSE_SCORE.test(r.text.replace(LEADING_TIME, '')));
  const diag: VitibetDiagnostics = { ...empty, linkRows: allRows.length, rowsWithScore: scored.length };

  const rule = new Map<string, RuleRow>();
  for (const r of scored) {
    const parsed = ruleParseRow(r.text);
    if (parsed) rule.set(r.fixtureId, parsed);
  }
  diag.ruleParsed = rule.size;

  // Gemini cleans the names. ~300 rows per call, calls run in parallel.
  const lineText = (r: LinkRow) => `${r.fixtureId} | ${r.text}`;
  const checkMap = new Map(scored.map((r) => [r.fixtureId, r.text]));
  const ai = await geminiExtractChunked(scored.map(lineText), 300, (lines) => ({
    source: 'vitibet',
    instructions:
      `Each input line is "fixture_id | row text". The row text is: kickoff time, home team, predicted home goals, ":", ` +
      `predicted away goals, away team, then a short tip code (digits such as 1, 2, 10, 02, or "-") that is NOT part of the ` +
      `away team's name and must be dropped. Team names may legitimately contain digits (e.g. "Super Nova 2", "Hannover 96").`,
    input: lines.join('\n'),
    checkSource: checkMap,
    allowedIds: new Set(scored.map((r) => r.fixtureId)),
    maxOutputTokens: 32000,
    timeoutMs: 25000, // the regex parser already covers every row, so do not wait long on Gemini
  }));
  diag.aiReturned = ai.returned;
  diag.aiRejected = ai.rejected;
  diag.aiError = ai.error;
  const aiById = new Map(ai.rows.filter((r) => r.id).map((r) => [r.id as string, r]));

  const predictions: VitibetPrediction[] = [];
  for (const r of scored) {
    const rl = rule.get(r.fixtureId);
    const a = aiById.get(r.fixtureId);

    let home: string | null = null;
    let away: string | null = null;
    let hs: number | null = null;
    let as: number | null = null;

    if (rl) {
      home = rl.home; away = rl.away; hs = rl.homeScore; as = rl.awayScore; // regex score is exact
    }
    if (a) {
      if (rl && (rl.homeScore !== a.homeScore || rl.awayScore !== a.awayScore)) diag.scoreMismatches++;
      if (rl && (normalizeForCheck(rl.home) !== normalizeForCheck(a.homeTeam) || normalizeForCheck(rl.away) !== normalizeForCheck(a.awayTeam))) {
        diag.nameDiffs++;
        if (diag.nameDiffSamples.length < 12) diag.nameDiffSamples.push(`rule "${rl.home}" v "${rl.away}"  ->  AI "${a.homeTeam}" v "${a.awayTeam}"`);
      }
      home = a.homeTeam; away = a.awayTeam;
      if (hs === null || as === null) { hs = a.homeScore; as = a.awayScore; }
      diag.aiUsed++;
    }

    if (home && away && hs !== null && as !== null) {
      predictions.push({ fixtureId: r.fixtureId, leagueId: r.leagueId, homeTeam: home, awayTeam: away, predictedScore: { home: hs, away: as } });
    }
  }

  if (predictions.length === 0) console.error('[vitibet] parsed 0 predictions -- page layout may have changed');
  return { htmlLength: html.length, predictions, diagnostics: diag, error: null, sampleRows: scored.slice(0, 8).map(lineText) };
}
