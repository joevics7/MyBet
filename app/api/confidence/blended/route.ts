import { NextRequest, NextResponse } from 'next/server';
import { computeConfidenceScoreFromNames, type MarketSelector } from '@/lib/services/confidenceEngine';
import { computeBlendedScore } from '@/lib/services/confidenceBlend';

export const runtime = 'nodejs';

// Experimental, separate from /api/confidence (which is untouched).
// Computes our own model's score first (the existing, unmodified
// pipeline), then blends it with Statarea's prediction if a match is
// found. No caching yet -- this is for testing the blend itself, not
// production traffic.

interface RequestBody {
  homeTeam: string;
  awayTeam: string;
  kickoffAt: string | null;
  market: MarketSelector;
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

  const ownOutcome = await computeConfidenceScoreFromNames({
    homeTeamName: body.homeTeam,
    awayTeamName: body.awayTeam,
    kickoffAt: body.kickoffAt,
    market: body.market,
  });

  if (ownOutcome.status !== 'ok') {
    // Our own model couldn't score this fixture at all -- nothing to
    // blend. Report the same status/message the un-blended endpoint would.
    return NextResponse.json(ownOutcome);
  }

  const blend = await computeBlendedScore(
    body.homeTeam,
    body.awayTeam,
    body.kickoffAt,
    body.market,
    ownOutcome.result.score,
  );

  return NextResponse.json({
    status: 'ok',
    ownModel: { score: ownOutcome.result.score, reason: ownOutcome.result.reason },
    blend,
  });
}
