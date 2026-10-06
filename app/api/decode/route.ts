import { NextRequest, NextResponse } from 'next/server';
import { getPlatform } from '@/lib/services/platforms';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import type { DecodeResult } from '@/lib/services/types';
import { computeConfidenceScoreFromNames } from '@/lib/services/confidenceEngine';
import { fetchTipsterSources, matchTipsterConsensus } from '@/lib/services/tipsterConsensus';
import { parseMarketString } from '@/lib/services/splitter';

export const runtime = 'nodejs';
export const maxDuration = 30; // now does real scoring work per selection, not just a quick decode

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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

  const adapter = getPlatform(platform);
  if (!adapter) {
    return NextResponse.json(
      { status: 'unsupported_platform', message: `No decode service for "${platform}" yet.` },
      { status: 200 },
    );
  }

  const result = await adapter.decode(code);

  // Persist best-effort. If Supabase isn't configured yet, or the write
  // fails, the caller still gets their decode result -- persistence is a
  // cache, not the source of truth for this response. decodeId/platformId
  // are captured (not just fire-and-forget) so the Vault save flow can
  // link a saved entry back to this specific decode.
  let decodeId: string | null = null;
  let platformId: string | null = null;
  try {
    const admin = getSupabaseAdmin();

    const { data: platformRow } = await admin
      .from('platforms')
      .select('id')
      .eq('slug', platform)
      .maybeSingle();
    platformId = platformRow?.id ?? null;

    const { data: decodeRow, error: decodeError } = await admin
      .from('decodes')
      .insert({
        platform_id: platformId,
        source_code: code,
        status: result.status,
        raw_response: result.raw ?? null,
      })
      .select('id')
      .single();

    if (!decodeError && decodeRow) {
      decodeId = decodeRow.id;

      if (result.selections.length > 0) {
        await admin.from('decoded_selections').insert(
          result.selections.map((s) => ({
            decode_id: decodeRow.id,
            platform_id: platformId,
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
    }
  } catch {
    // Supabase not configured yet, or the write failed -- non-fatal.
  }

  if (result.status !== 'ok') {
    return NextResponse.json(result);
  }

  // Tipster sources (Statarea, Predictz) are fetched ONCE for the whole
  // request here, then matched per selection below with no further I/O.
  // This was previously called per-selection inside the loop -- a real
  // performance bug: it multiplied a multi-selection slip's decode time
  // by its selection count (each selection re-fetching both sites'
  // entire prediction pages from scratch), risking a Vercel timeout on
  // anything but a single-selection code.
  // Every distinct date present in the slip -- a code can bundle
  // selections across several days, and each needs its own Statarea
  // fetch (scoping to only one date silently loses matches for the
  // others, which happened in production before this fix).
  const kickoffDates = Array.from(
    new Set(result.selections.map((s) => s.kickoffAt?.slice(0, 10)).filter((d): d is string => !!d)),
  );

  let tipsterSourceData;
  try {
    tipsterSourceData = await fetchTipsterSources(kickoffDates);
  } catch (err) {
    console.error('[decode] fetchTipsterSources failed entirely:', err);
    tipsterSourceData = { statarea: [], predictz: [] };
  }

  // Score each selection with TWO independent scores, never combined:
  // `score` (BetMeter Score, our own Poisson model -- still a real,
  // per-selection football-data.org lookup) and `tipsterScore` (now just
  // a cheap in-memory match against the data fetched above). Only score
  // when the market can be confidently identified (parseMarketString
  // returns null rather than guessing for anything unconfirmed).
  // Throttled since football-data.org is 10 req/min.
  const scoredSelections = [];
  for (const sel of result.selections) {
    let score: number | null = null;
    let tipsterScore: number | null = null;
    let tipsterSources: string[] = [];
    const parsedMarket = parseMarketString(sel.market, sel.homeTeam, sel.awayTeam);

    if (parsedMarket) {
      try {
        const ownOutcome = await computeConfidenceScoreFromNames({
          homeTeamName: sel.homeTeam,
          awayTeamName: sel.awayTeam,
          kickoffAt: sel.kickoffAt,
          market: parsedMarket,
        });
        if (ownOutcome.status === 'ok') score = ownOutcome.result.score;
      } catch (err) {
        console.error('[decode] BetMeter Score failed for selection:', sel.homeTeam, err);
      }

      const tipsterOutcome = matchTipsterConsensus(
        sel.homeTeam,
        sel.awayTeam,
        sel.kickoffAt,
        parsedMarket,
        tipsterSourceData,
      );
      tipsterScore = tipsterOutcome.score;
      tipsterSources = tipsterOutcome.sources;

      await sleep(150);
    }

    scoredSelections.push({ ...sel, score, tipsterScore, tipsterSources });
  }

  return NextResponse.json({ ...result, selections: scoredSelections, decodeId, platformId });
}
