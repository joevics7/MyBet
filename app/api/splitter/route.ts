import { NextRequest, NextResponse } from 'next/server';
import { getPlatform, deepLinkFor } from '@/lib/services/platforms';
import { computeConfidenceScoreFromNames } from '@/lib/services/confidenceEngine';
import { splitSelections, parseMarketString, type SplittableSelection, type SplitMode } from '@/lib/services/splitter';

export const runtime = 'nodejs';
export const maxDuration = 30;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface RequestBody {
  code: string;
  platform?: string;
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

  const platformSlug = body.platform?.trim().toLowerCase() || 'sportybet';
  const adapter = getPlatform(platformSlug);
  if (!adapter) {
    return NextResponse.json({ error: `"${platformSlug}" isn't supported yet` }, { status: 200 });
  }

  const decoded = await adapter.decode(body.code);
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
      rawMarketId: sel.rawMarketId,
      rawOutcomeId: sel.rawOutcomeId,
      rawSpecifier: sel.rawSpecifier,
    });
  }

  const groups = splitSelections(scored, body.mode, body.groupCount ?? 2);

  // Attempt to generate a real sub-code for each group. encodeSportyBetSlip
  // is implemented against an inferred (unconfirmed) payload shape -- see
  // its top comment in sportybet.ts. A selection missing its raw fields
  // (shouldn't happen for SportyBet decodes, but defensive) is skipped
  // from the encode call entirely rather than sent with blank/wrong IDs.
  const groupsWithCodes = await Promise.all(
    groups.map(async (group) => {
      // Platforms without a create endpoint (Bangbet, Bet9ja) return the
      // split as a pick list with confidence; the user re-enters it by hand.
      if (!adapter.encode) return { ...group, generatedCode: null, deepLink: null };

      const encodable = group.selections.filter((s) => s.rawMarketId && s.rawOutcomeId);
      if (encodable.length !== group.selections.length) {
        return { ...group, generatedCode: null, deepLink: null };
      }

      const encodeResult = await adapter.encode!(
        encodable.map((s) => ({
          externalEventId: s.externalEventId,
          marketId: s.rawMarketId!,
          outcomeId: s.rawOutcomeId!,
          specifier: s.rawSpecifier,
        })),
      );
      return {
        ...group,
        generatedCode: encodeResult.shareCode,
        deepLink: encodeResult.shareCode ? deepLinkFor(adapter.slug, encodeResult.shareCode) : null,
      };
    }),
  );

  return NextResponse.json({
    status: 'ok',
    platform: adapter.slug,
    canEncode: !!adapter.encode,
    sourceCode: body.code,
    groups: groupsWithCodes,
  });
}
