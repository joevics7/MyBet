// Predictz scraper -- EXPERIMENTAL. Built from predictz.com's historically
// known table format (match, predicted result, correct score, BTTS,
// Over/Under), NOT from direct inspection of the live page: the site was
// fully bot-blocked for this environment even after ZenRows was wired in
// (no API key available here to test with). Unlike statarea.ts, this was
// never confirmed against real content before being wired into the
// product. If it returns zero predictions in production, check Vercel
// logs for "[predictz]" -- that means the pattern below needs adjusting
// to match the site's actual current layout, not that anything crashed.

import { fetchViaZenRows, stripHtml, fetchAndStripViaZenRows } from './zenrows';
import type { PredictedScore } from './scoreToMarkets';

const PREDICTZ_URL = 'https://www.predictz.com/predictions/';

export interface PredictzPrediction {
  homeTeam: string;
  awayTeam: string;
  predictedScore: PredictedScore | null;
}

function parseScoreString(s: string): PredictedScore | null {
  const m = s.match(/(\d+)\s*-\s*(\d+)/);
  if (!m) return null;
  return { home: parseInt(m[1], 10), away: parseInt(m[2], 10) };
}

// Raw, unparsed text -- for inspecting predictz's real current layout
// before trusting any parser against it. fetchPredictzPredictions() below
// is NOT currently wired into the product (tipsterConsensus.ts calls it,
// but it reliably returns 0 results) until this is confirmed for real.
export async function fetchPredictzRawText(): Promise<string | null> {
  return fetchAndStripViaZenRows(PREDICTZ_URL, { jsRender: true, premiumProxy: true });
}

// Best-effort, loose pattern: "<Home Team> v <Away Team>" followed within
// ~40 characters by a correct-score prediction like "2-1". Intentionally
// permissive since the real current layout is unconfirmed -- a tighter
// pattern risks matching nothing at all rather than matching the wrong
// thing, so loose-but-monitored is the safer failure mode here.
const MATCH_PATTERN = /([A-Z][A-Za-z.\s]{2,30}?)\s+v\s+([A-Z][A-Za-z.\s]{2,30}?)\b[^0-9]{0,40}?(\d\s*-\s*\d)/g;

export async function fetchPredictzPredictions(): Promise<PredictzPrediction[]> {
  const html = await fetchViaZenRows('https://www.predictz.com/predictions/', {
    jsRender: true,
    premiumProxy: true,
  });

  if (!html) {
    console.error('[predictz] ZenRows fetch failed -- check ZENROWS_API_KEY is set and has remaining credits');
    return [];
  }

  const text = stripHtml(html);
  const predictions: PredictzPrediction[] = [];

  MATCH_PATTERN.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = MATCH_PATTERN.exec(text)) !== null) {
    const [, homeTeam, awayTeam, scoreStr] = m;
    predictions.push({
      homeTeam: homeTeam.trim(),
      awayTeam: awayTeam.trim(),
      predictedScore: parseScoreString(scoreStr),
    });
  }

  if (predictions.length === 0) {
    console.error('[predictz] parsed 0 predictions -- pattern likely needs adjustment to match the real page layout');
  }

  return predictions;
}
