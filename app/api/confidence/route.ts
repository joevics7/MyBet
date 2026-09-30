import { NextRequest, NextResponse } from 'next/server';
import { computeConfidenceScore, marketLabel, type MarketSelector } from '@/lib/services/confidenceEngine';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

export const runtime = 'nodejs';

const CACHE_HOURS = 24;

interface RequestBody {
  homeTeamId: number;
  awayTeamId: number;
  homeTeamName: string;
  awayTeamName: string;
  market: MarketSelector;
}

// NOTE: this engine is keyed by football-data.org team IDs, not a betting
// platform's event ID -- the two aren't linked yet (see confidenceEngine.ts
// top comment). The cache key below is synthetic (fd:{homeId}v{awayId})
// until that matching layer exists; platform_id is left null.
function syntheticEventId(homeTeamId: number, awayTeamId: number): string {
  return `fd:${homeTeamId}v${awayTeamId}`;
}

export async function POST(req: NextRequest) {
  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!body.homeTeamId || !body.awayTeamId || !body.market) {
    return NextResponse.json({ error: 'homeTeamId, awayTeamId, and market are required' }, { status: 400 });
  }

  const eventId = syntheticEventId(body.homeTeamId, body.awayTeamId);
  const market = marketLabel(body.market);

  // Check cache first -- football-data.org's free tier is 10 req/min, and
  // every uncached call burns 2 Gemini calls' worth of work (well, one),
  // so a 24h cache per event+market matters here more than it did for decode.
  try {
    const admin = getSupabaseAdmin();
    const { data: cached } = await admin
      .from('confidence_scores')
      .select('score, reason, computed_at, expires_at')
      .eq('external_event_id', eventId)
      .eq('market', market)
      .gte('expires_at', new Date().toISOString())
      .maybeSingle();

    if (cached) {
      return NextResponse.json({ status: 'ok', result: cached, cached: true });
    }
  } catch {
    // Supabase not configured -- fall through and compute fresh every time.
  }

  const outcome = await computeConfidenceScore({
    homeTeamId: body.homeTeamId,
    awayTeamId: body.awayTeamId,
    homeTeamName: body.homeTeamName,
    awayTeamName: body.awayTeamName,
    market: body.market,
  });

  if (outcome.status === 'insufficient_data') {
    return NextResponse.json(outcome, { status: 200 });
  }

  try {
    const admin = getSupabaseAdmin();
    const { data: existing } = await admin
      .from('confidence_scores')
      .select('id')
      .eq('external_event_id', eventId)
      .eq('market', market)
      .maybeSingle();

    const row = {
      platform_id: null,
      external_event_id: eventId,
      market,
      score: outcome.result.score,
      reason: outcome.result.reason,
      computed_at: outcome.result.computedAt,
      expires_at: new Date(Date.now() + CACHE_HOURS * 3600 * 1000).toISOString(),
    };

    // Not using .upsert(onConflict: 'platform_id,external_event_id,market')
    // here: Postgres treats each NULL as distinct in a unique constraint,
    // so with platform_id null (the case until team-matching exists),
    // onConflict would never actually detect a match -- it'd silently
    // insert a fresh duplicate row every time instead of updating.
    if (existing) {
      await admin.from('confidence_scores').update(row).eq('id', existing.id);
    } else {
      await admin.from('confidence_scores').insert(row);
    }
  } catch {
    // Non-fatal -- caller still gets their result even if caching failed.
  }

  return NextResponse.json({ status: 'ok', result: outcome.result, cached: false });
}
