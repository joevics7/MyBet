import { NextRequest, NextResponse } from 'next/server';
import { decodeSportyBetCode } from '@/lib/services/sportybet';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

export const runtime = 'nodejs';

// Platform decode services, keyed by platforms.slug. Add an entry here as
// each platform's Decode Service ships.
const DECODERS: Record<string, (code: string) => ReturnType<typeof decodeSportyBetCode>> = {
  sportybet: decodeSportyBetCode,
};

export async function POST(req: NextRequest) {
  let body: { platform?: string; code?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const platform = body.platform?.trim().toLowerCase();
  const code = body.code?.trim();

  if (!platform || !code) {
    return NextResponse.json({ error: 'platform and code are required' }, { status: 400 });
  }

  const decoder = DECODERS[platform];
  if (!decoder) {
    return NextResponse.json(
      { status: 'unsupported_platform', message: `No decode service for "${platform}" yet.` },
      { status: 200 },
    );
  }

  const result = await decoder(code);

  // Persist best-effort. If Supabase isn't configured yet, or the write
  // fails, the caller still gets their decode result -- persistence is a
  // cache, not the source of truth for this response.
  try {
    const admin = getSupabaseAdmin();

    const { data: platformRow } = await admin
      .from('platforms')
      .select('id')
      .eq('slug', platform)
      .maybeSingle();

    const { data: decodeRow, error: decodeError } = await admin
      .from('decodes')
      .insert({
        platform_id: platformRow?.id ?? null,
        source_code: code,
        status: result.status,
        raw_response: result.raw ?? null,
      })
      .select('id')
      .single();

    if (!decodeError && decodeRow && result.selections.length > 0) {
      await admin.from('decoded_selections').insert(
        result.selections.map((s) => ({
          decode_id: decodeRow.id,
          platform_id: platformRow?.id ?? null,
          external_event_id: s.externalEventId,
          home_team: s.homeTeam,
          away_team: s.awayTeam,
          market: s.market,
          odds: s.odds,
          kickoff_at: s.kickoffAt,
          is_locked: s.isLocked,
          match_status: s.matchStatus,
          is_winning: s.isWinning,
        })),
      );
    }
  } catch {
    // Supabase not configured yet, or the write failed -- non-fatal.
  }

  return NextResponse.json(result);
}
