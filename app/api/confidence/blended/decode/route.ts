import { NextRequest, NextResponse } from 'next/server';
import { decodeSportyBetCode } from '@/lib/services/sportybet';
import { decodeBet9jaCode } from '@/lib/services/bet9ja';
import type { DecodeResult } from '@/lib/services/types';
import { computeConfidenceScoreFromNames } from '@/lib/services/confidenceEngine';
import { computeBlendedScore } from '@/lib/services/confidenceBlend';
import { parseMarketString } from '@/lib/services/splitter';

export const runtime = 'nodejs';
export const maxDuration = 30;

// Convenience test route: paste a real booking code instead of hand-typing
// team names/markets. Decodes (existing, unmodified decode services),
// then runs BOTH the own-model score and the Statarea blend per
// selection, side by side -- so a real code (e.g. one with live
// international fixtures) is an easy end-to-end test of the blend
// module from confidenceBlend.ts without needing Postman/curl.

const DECODERS: Record<string, (code: string) => Promise<DecodeResult>> = {
  sportybet: decodeSportyBetCode,
  bet9ja: decodeBet9jaCode,
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface RequestBody {
  platform?: string;
  code: string;
}

export async function POST(req: NextRequest) {
  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  if (!body.code) {
    return NextResponse.json({ error: 'code is required' }, { status: 400 });
  }

  const platform = (body.platform ?? 'sportybet').toLowerCase();
  const decoder = DECODERS[platform];
  if (!decoder) {
    return NextResponse.json({ error: `Unsupported platform: ${platform}` }, { status: 400 });
  }

  const decoded = await decoder(body.code);
  if (decoded.status !== 'ok') {
    return NextResponse.json({ error: "Couldn't decode that code" }, { status: 200 });
  }

  const results = [];
  for (const sel of decoded.selections) {
    const parsedMarket = parseMarketString(sel.market, sel.homeTeam, sel.awayTeam);

    if (!parsedMarket) {
      results.push({
        homeTeam: sel.homeTeam,
        awayTeam: sel.awayTeam,
        market: sel.market,
        note: "Market couldn't be confidently parsed -- skipped",
      });
      continue;
    }

    const ownOutcome = await computeConfidenceScoreFromNames({
      homeTeamName: sel.homeTeam,
      awayTeamName: sel.awayTeam,
      kickoffAt: sel.kickoffAt,
      market: parsedMarket,
    });

    if (ownOutcome.status !== 'ok') {
      results.push({
        homeTeam: sel.homeTeam,
        awayTeam: sel.awayTeam,
        market: sel.market,
        note: ownOutcome.status === 'not_covered' ? 'Not covered by football-data.org' : ownOutcome.message,
      });
      await sleep(150);
      continue;
    }

    const blend = await computeBlendedScore(sel.homeTeam, sel.awayTeam, sel.kickoffAt, parsedMarket, ownOutcome.result.score);

    results.push({
      homeTeam: sel.homeTeam,
      awayTeam: sel.awayTeam,
      market: sel.market,
      ownModelScore: ownOutcome.result.score,
      statareaMatched: blend.externalSource === 'statarea',
      statareaScore: blend.externalScore,
      blendedScore: blend.blendedScore,
    });

    await sleep(150);
  }

  return NextResponse.json({ sourceCode: body.code, platform, selections: results });
}
