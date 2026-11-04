import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { getPlatform, deepLinkFor } from '@/lib/services/platforms';
import { resolveForSportyFamily } from '@/lib/converter/resolve';
import type { MarketSelector } from '@/lib/services/confidenceEngine';
import type { EncodeSelectionInput } from '@/lib/services/sportybet';

export const runtime = 'nodejs';
export const maxDuration = 60;

// Create ONE booking code from several predicted games. These four share SportyBet's game and market ids, so the same
// resolved picks work on all of them. Betway needs a login; the 1xBet-style sites need a match list we don't have yet.
const PLATFORMS = ['sportybet', 'footballcom', 'msport', 'bangbet'];
const MAX_GAMES = 20;

// light abuse guard: 8 requests a minute per IP, per server instance
const hits = new Map<string, number[]>();
function limited(ip: string): boolean {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < 60_000);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > 8;
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  if (limited(ip)) return NextResponse.json({ error: 'Too many requests. Try again in a minute.' }, { status: 429 });

  let body: { platform?: string; gameIds?: string[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Bad request.' }, { status: 400 });
  }
  const platform = String(body.platform ?? '');
  const ids = Array.from(new Set((body.gameIds ?? []).map(String))).slice(0, MAX_GAMES + 1);
  if (!PLATFORMS.includes(platform)) return NextResponse.json({ error: 'Choose SportyBet, Football.com, MSport or Bangbet.' }, { status: 400 });
  if (ids.length === 0) return NextResponse.json({ error: 'Select at least one game.' }, { status: 400 });
  if (ids.length > MAX_GAMES) return NextResponse.json({ error: `Select at most ${MAX_GAMES} games.` }, { status: 400 });

  const { data: rows, error } = await getSupabaseAdmin()
    .from('predictor_games')
    .select('id,external_event_id,home_team,away_team,market,selector,odds,kickoff_at')
    .in('id', ids);
  if (error || !rows) return NextResponse.json({ error: 'Could not load the selected games.' }, { status: 500 });

  const skipped: { game: string; reason: string }[] = [];
  const usable = rows.filter((r) => {
    if (r.kickoff_at && Date.parse(r.kickoff_at) <= Date.now()) {
      skipped.push({ game: `${r.home_team} v ${r.away_team}`, reason: 'Already started' });
      return false;
    }
    return true;
  });
  if (usable.length === 0) return NextResponse.json({ error: 'None of the selected games can be booked (already started).', skipped }, { status: 422 });

  const resolved = await resolveForSportyFamily(
    usable.map((r) => ({
      leg: {
        externalEventId: r.external_event_id, homeTeam: r.home_team, awayTeam: r.away_team, market: r.market,
        odds: r.odds === null ? 0 : Number(r.odds), kickoffAt: r.kickoff_at, isLocked: false, matchStatus: null, isWinning: null,
      },
      selector: r.selector as MarketSelector,
    })),
  ).catch(() => null);
  if (!resolved) return NextResponse.json({ error: 'Could not look the games up on the platform. Try again.' }, { status: 502 });

  const inputs: EncodeSelectionInput[] = [];
  resolved.forEach((res, i) => {
    if (res.ok) inputs.push(res.input);
    else skipped.push({ game: `${usable[i].home_team} v ${usable[i].away_team}`, reason: res.reason });
  });
  if (inputs.length === 0) return NextResponse.json({ error: 'None of the selected bets were found on that platform.', skipped }, { status: 422 });

  const adapter = getPlatform(platform);
  if (!adapter?.encode) return NextResponse.json({ error: 'Code creation is not available for that platform.' }, { status: 400 });
  try {
    const enc = await adapter.encode(inputs);
    if (enc.status !== 'ok' || !enc.shareCode) return NextResponse.json({ error: `${adapter.label} would not create a code. Try again or pick fewer games.`, skipped }, { status: 502 });
    let totalOdds: number | null = null;
    try {
      const back = await adapter.decode(enc.shareCode);
      if (back.status === 'ok') totalOdds = back.totalOdds;
    } catch { /* the code exists; the read-back is only for the total */ }
    return NextResponse.json({ code: enc.shareCode, platform, label: adapter.label, deepLink: deepLinkFor(platform, enc.shareCode), totalOdds, used: inputs.length, skipped });
  } catch (err) {
    console.error('[predictor slip] encode failed:', platform, err);
    return NextResponse.json({ error: `${adapter.label} would not create a code.`, skipped }, { status: 502 });
  }
}
