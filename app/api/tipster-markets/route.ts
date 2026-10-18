import { NextRequest, NextResponse } from 'next/server';
import { fetchTipsterSources, getTipsterMarkets } from '@/lib/services/tipsterConsensus';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /api/tipster-markets?home=Bologna&away=Inter&date=2026-10-17[&fixtureId=1575185]
// Every market (Over/Under 0.5-3.5, GG/NG, 1X2, Double Chance, Odd/Even, Home/Away team goals, Winning
// Margin, Win to Nil) for one fixture, from the averaged expected goals of whichever tipster sources have
// it. Reads the CACHE only -- no ZenRows, no Gemini, no live fetching -- so it is free to call.
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const home = q.get('home')?.trim();
  const away = q.get('away')?.trim();
  const date = q.get('date')?.trim();
  const fixtureId = q.get('fixtureId')?.trim() || null;

  if (!home || !away || !date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: 'Required: home, away, date (YYYY-MM-DD). Optional: fixtureId.' }, { status: 400 });
  }

  const sources = await fetchTipsterSources([date]);
  const result = getTipsterMarkets(home, away, `${date}T00:00:00Z`, sources, fixtureId);
  if (!result) {
    return NextResponse.json(
      {
        found: false,
        note: 'No tipster source has this match in the cache for that date (cron may not have run, or the names did not match any source).',
        cached: {
          statarea: sources.statarea.length,
          predictz: sources.predictz.length,
          vitibet: sources.vitibet.length,
          soccertips: sources.soccertips.length,
        },
      },
      { status: 404 },
    );
  }

  return NextResponse.json({ found: true, home, away, date, matchedAs: result.matches, ...result.markets });
}
