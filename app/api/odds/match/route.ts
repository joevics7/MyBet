import { NextResponse } from 'next/server';
import { finishTables, getMatchOdds, isOddsPapiConfigured } from '@/lib/services/oddsPapi';
import { getBetwayMatchPrices } from '@/lib/services/betwayBrowse';

export const maxDuration = 30;

// GET /api/odds/match?fixtureId=...  -> one match's odds across bookmakers
export async function GET(request: Request) {
  if (!isOddsPapiConfigured()) {
    return NextResponse.json({ status: 'unavailable', message: 'Odds data is not set up yet.' });
  }
  const fixtureId = new URL(request.url).searchParams.get('fixtureId') ?? '';
  if (!/^[A-Za-z0-9_-]{4,64}$/.test(fixtureId)) {
    return NextResponse.json({ error: 'Invalid fixtureId' }, { status: 400 });
  }

  try {
    const data = await getMatchOdds(fixtureId);
    if (!data) return NextResponse.json({ status: 'error', message: 'No odds found for this match.' });

    // Betway NG is read straight from Betway (matched by team names + kickoff).
    // Best effort: if it can't be found, the page simply has no Betway NG row.
    const betway = await getBetwayMatchPrices(data.match.home, data.match.away, data.match.kickoff).catch(() => null);
    if (betway) {
      for (const table of data.markets) {
        const prices = betway[table.key];
        if (prices && prices.length === table.outcomes.length) {
          table.rows.push({ slug: 'betway-ng', label: 'Betway NG', prices });
        }
      }
    }

    return NextResponse.json({ status: 'ok', match: data.match, markets: finishTables(data.markets) });
  } catch (err) {
    console.error('[odds/match]', err);
    return NextResponse.json({ status: 'error', message: "Couldn't load odds. Try again shortly." });
  }
}
