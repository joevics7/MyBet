import { NextRequest, NextResponse } from 'next/server';
import { decodeSportyBetCode, encodeSportyBetSlip } from '@/lib/services/sportybet';
import { computeConfidenceScoreFromNames } from '@/lib/services/confidenceEngine';
import { splitSelections, parseMarketString, type SplittableSelection, type SplitMode } from '@/lib/services/splitter';

export const runtime = 'nodejs';
export const maxDuration = 30;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface RequestBody {
  code: string;
  mode: SplitMode;
  groupCount?: number;
}

export async function POST(req: NextRequest) {
  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!body.code || !body.mode) {
    return NextResponse.json({ error: 'code and mode are required' }, { status: 400 });
  }

  const decoded = await decodeSportyBetCode(body.code);
  if (decoded.status !== 'ok') {
    return NextResponse.json({ error: "Couldn't decode that code" }, { status: 200 });
  }

  // Best-effort confidence scoring per selection -- a selection not
  // covered by football-data.org (very common for lower-league/
  // international fixtures, see confidenceEngine.ts) just gets score:
  // null and lands in the "Ungraded" group for risk-mode splitting.
  // Sequential with a light throttle, same reasoning as the Predictor
  // cron: football-data.org is 10 req/min.
  const scored: SplittableSelection[] = [];
  for (const sel of decoded.selections) {
    let score: number | null = null;
    const parsedMarket = parseMarketString(sel.market, sel.homeTeam, sel.awayTeam);

    // Only attempt scoring when we can confidently identify which market
    // and outcome this selection actually is -- see parseMarketString's
    // comment for why guessing here would be worse than leaving it
    // ungraded.
    if (parsedMarket) {
      try {
        const outcome = await computeConfidenceScoreFromNames({
          homeTeamName: sel.homeTeam,
          awayTeamName: sel.awayTeam,
          kickoffAt: sel.kickoffAt,
          market: parsedMarket,
        });
        if (outcome.status === 'ok') score = outcome.result.score;
      } catch (err) {
        console.error('[splitter] confidence scoring failed for selection, leaving ungraded:', sel.homeTeam, err);
      }
      await sleep(150);
    }

    scored.push({
      externalEventId: sel.externalEventId,
      homeTeam: sel.homeTeam,
      awayTeam: sel.awayTeam,
      market: sel.market,
      odds: sel.odds,
      score,
    });
  }

  const groups = splitSelections(scored, body.mode, body.groupCount ?? 2);

  // Attempt to generate a real sub-code for each group. encodeSportyBetSlip
  // is currently a stub (see sportybet.ts) -- every group will come back
  // with generatedCode: null until that's implemented, but the grouping
  // itself is fully functional and shown regardless.
  const groupsWithCodes = await Promise.all(
    groups.map(async (group) => {
      const encodeResult = await encodeSportyBetSlip(
        group.selections.map((s) => ({
          externalEventId: s.externalEventId,
          marketId: '', // not retained on decoded selections currently -- would need threading through if encode is implemented
          outcomeId: '',
          sportId: '',
        })),
      );
      return { ...group, generatedCode: encodeResult.shareCode };
    }),
  );

  return NextResponse.json({ status: 'ok', sourceCode: body.code, groups: groupsWithCodes });
}
