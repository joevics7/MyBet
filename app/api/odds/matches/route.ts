import { NextResponse } from 'next/server';
import { isOddsPapiConfigured, listMatches } from '@/lib/services/oddsPapi';

export const maxDuration = 30;

// GET /api/odds/matches?date=YYYY-MM-DD  -> matches that have odds that day (UTC)
export async function GET(request: Request) {
  if (!isOddsPapiConfigured()) {
    return NextResponse.json({ status: 'unavailable', message: 'Odds data is not set up yet.' });
  }
  const date = new URL(request.url).searchParams.get('date') ?? '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: 'date must be YYYY-MM-DD' }, { status: 400 });
  }
  try {
    const matches = await listMatches(date);
    return NextResponse.json({ status: 'ok', matches });
  } catch (err) {
    console.error('[odds/matches]', err);
    return NextResponse.json({ status: 'error', message: "Couldn't load matches. Try again shortly." });
  }
}
