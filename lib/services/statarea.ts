// Statarea prediction scraper -- EXPERIMENTAL, purely additive "side"
// signal. Does NOT modify poissonModel.ts or confidenceEngine.ts's
// primary scoring path at all; blended in separately, only when
// explicitly requested (see confidenceBlend.ts).
//
// CAVEATS, read before touching this file:
// - Text-pattern parsing, not CSS selectors. This environment could only
//   inspect statarea.com's rendered/markdown-converted content, never its
//   raw HTML tags or class names -- so instead of selector-based scraping
//   (fragile to class-name changes, but at least fails loudly), this
//   parses the page's rendered TEXT for a repeating pattern confirmed
//   directly from a real fetch on 2026-10-03. This is MORE fragile than
//   selector scraping: if statarea changes its text layout, this breaks
//   SILENTLY (returns fewer/zero matches), not with a clear error.
//   Monitor the match count; a sudden drop to 0 means the pattern broke.
// - UNCONFIRMED from production. Fetching statarea.com worked from this
//   conversation's own fetch tool, which has different bot-evasion
//   characteristics than a plain server-side fetch() -- the exact gap
//   that caused Bet9ja's Akamai block. Needs a live test from Vercel.
// - Statarea's displayed time is in a visitor-dependent timezone (GMT-4
//   was shown in testing) -- the `date` field is reliable (matched the
//   page's own date), `time` should be treated as approximate only.

export interface StatareaPrediction {
  date: string; // YYYY-MM-DD
  time: string; // HH:MM, approximate -- see timezone caveat above
  homeTeam: string;
  awayTeam: string;
  tip: string; // Statarea's own shorthand pick, e.g. "1X", "2"
  homeWinPercent: number;
  drawPercent: number;
  awayWinPercent: number;
  htHomeWinPercent: number;
  htDrawPercent: number;
  htAwayWinPercent: number;
  over15Percent: number;
  over25Percent: number;
  over35Percent: number;
  bttsYesPercent: number;
  bttsNoPercent: number;
}

// Matches the repeating block confirmed in real fetched content:
//   TIP <tip> <date> <time> - <home> - <away> 1 X 2 H1 HX H2 1.5 2.5 3.5 BTS OTS <11 numbers>
const MATCH_PATTERN =
  /TIP\s+(\S+)\s+(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})\s+-\s+(.+?)\s+-\s+(.+?)\s+1\s+X\s+2\s+H1\s+HX\s+H2\s+1\.5\s+2\.5\s+3\.5\s+BTS\s+OTS\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)/g;

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

// date: optional YYYY-MM-DD; omit for today's predictions.
export async function fetchStatareaPredictions(date?: string): Promise<StatareaPrediction[]> {
  const path = date ? `/predictions/date/${date}/competition` : '/predictions';
  const url = `https://www.statarea.com${path}`;

  let res: Response;
  try {
    res = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml',
      },
      signal: AbortSignal.timeout(10000),
    });
  } catch (err) {
    console.error('[statarea] fetch threw:', err);
    return [];
  }

  if (!res.ok) {
    console.error('[statarea] non-OK response:', res.status);
    return [];
  }

  const html = await res.text();
  const text = stripHtml(html);

  const predictions: StatareaPrediction[] = [];
  MATCH_PATTERN.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = MATCH_PATTERN.exec(text)) !== null) {
    const [, tip, matchDate, time, homeTeam, awayTeam, n1, n2, n3, n4, n5, n6, n7, n8, n9, n10, n11] = m;
    predictions.push({
      date: matchDate,
      time,
      homeTeam: homeTeam.trim(),
      awayTeam: awayTeam.trim(),
      tip,
      homeWinPercent: parseInt(n1, 10),
      drawPercent: parseInt(n2, 10),
      awayWinPercent: parseInt(n3, 10),
      htHomeWinPercent: parseInt(n4, 10),
      htDrawPercent: parseInt(n5, 10),
      htAwayWinPercent: parseInt(n6, 10),
      over15Percent: parseInt(n7, 10),
      over25Percent: parseInt(n8, 10),
      over35Percent: parseInt(n9, 10),
      bttsYesPercent: parseInt(n10, 10),
      bttsNoPercent: parseInt(n11, 10),
    });
  }

  if (predictions.length === 0) {
    console.error('[statarea] parsed 0 predictions -- pattern may have broken, or the page structure changed');
  }

  return predictions;
}
