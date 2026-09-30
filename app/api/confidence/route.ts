import { NextRequest, NextResponse } from 'next/server';
import { computeConfidenceScoreFromNames, marketLabel, type MarketSelector } from '@/lib/services/confidenceEngine';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

export const runtime = 'nodejs';

const CACHE_HOURS = 24;

interface RequestBody {
  homeTeam: string;
  awayTeam: string;
  kickoffAt: string | null;
  market: MarketSelector;
}

// Cache key is the raw (normalized) input, not a resolved team ID -- we
// don't have one until matching succeeds, and caching by input avoids
// re-running the whole match+score pipeline for the same decoded
// selection text within the cache window even when matching fails.
function cacheKey(homeTeam: string, awayTeam: string): string {
  const norm = (s: string) => s.toLowerCase().trim().replace(/\s+/g, ' ');
  return `name:${norm(homeTeam)}v${norm(awayTeam)}`;
}

export async function POST(req: NextRequest) {
  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!body.homeTeam || !body.awayTeam || !body.market) {
    return NextResponse.json({ error: 'homeTeam, awayTeam, and market are required' }, { status: 400 });
  }

  const eventId = cacheKey(body.homeTeam, body.awayTeam);
  const market = marketLabel(body.market);

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

  const outcome = await computeConfidenceScoreFromNames({
    homeTeamName: body.homeTeam,
    awayTeamName: body.awayTeam,
    kickoffAt: body.kickoffAt,
    market: body.market,
  });

  if (outcome.status !== 'ok') {
    return NextResponse.json(outcome, { status: 200 });
  }

  try {
    const admin = getSupabaseAdmin();
    const row = {
      platform_id: null,
      external_event_id: eventId,
      market,
      score: outcome.result.score,
      reason: outcome.result.reason,
      computed_at: outcome.result.computedAt,
      expires_at: new Date(Date.now() + CACHE_HOURS * 3600 * 1000).toISOString(),
    };

    // See earlier note (bet9ja/decode route history): not using .upsert()
    // with onConflict here, since platform_id is null and Postgres treats
    // NULLs as distinct in unique constraints -- onConflict would never
    // match and would silently accumulate duplicate rows.
    const { data: existing } = await admin
      .from('confidence_scores')
      .select('id')
      .eq('external_event_id', eventId)
      .eq('market', market)
      .maybeSingle();

    if (existing) {
      await admin.from('confidence_scores').update(row).eq('id', existing.id);
    } else {
      await admin.from('confidence_scores').insert(row);
    }
  } catch {
    // Non-fatal.
  }

  return NextResponse.json({
    status: 'ok',
    result: outcome.result,
    matchedFixture: outcome.matchedFixture,
    cached: false,
  });
}
