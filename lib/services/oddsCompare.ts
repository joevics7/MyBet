// Odds comparison across platforms that share SportyBet-style Sportradar IDs
// (SportyBet, Football.com, MSport).
//
// How it works with no extra endpoints: for each pick we know the event,
// market, specifier and outcome IDs. For every OTHER platform we create a
// one-pick booking code from those IDs, decode it, and read that platform's
// current odds for the exact same selection. The decoded IDs are compared
// against the request, so a different market is never reported as a match.
//
// Platforms with their own ID scheme (Betway, Bangbet, ...) can't take part
// until their events are mapped to Sportradar IDs.
// Cost: 2 requests per pick per extra platform, hence MAX_LEGS.

import type { NormalizedSelection } from './types';
import { PLATFORMS, getPlatform, type PlatformAdapter } from './platforms';

export const MAX_LEGS = 12;
const CONCURRENCY = 4;

export interface Quote {
  odds: number | null;
  reason?: string; // why there's no price (not offered, closed, ...)
  locked?: boolean;
}

export interface LegComparison {
  homeTeam: string;
  awayTeam: string;
  market: string;
  kickoffAt: string | null;
  sourceOdds: number;
  quotes: Record<string, Quote>; // by platform slug, includes the source
  bestSlug: string | null;
  bestOdds: number | null;
  gainPct: number | null; // best vs source price, in %
}

export interface PlatformTotal {
  slug: string;
  label: string;
  coveredLegs: number;
  totalLegs: number;
  totalOdds: number | null; // only when every leg has a price
}

export interface OddsComparison {
  source: { slug: string; label: string };
  legs: LegComparison[];
  platforms: PlatformTotal[];
  recommendedSlug: string | null; // best full-coverage total
  truncated: boolean;
}

export function comparablePlatforms(): PlatformAdapter[] {
  return PLATFORMS.filter((p) => p.oddsLookup);
}

async function quoteOnPlatform(target: PlatformAdapter, leg: NormalizedSelection): Promise<Quote> {
  if (!leg.rawMarketId || !leg.rawOutcomeId || !leg.externalEventId.startsWith('sr:')) {
    return { odds: null, reason: 'Pick has no shared event ID' };
  }
  try {
    const enc = await target.encode!([
      {
        externalEventId: leg.externalEventId,
        marketId: leg.rawMarketId,
        outcomeId: leg.rawOutcomeId,
        specifier: leg.rawSpecifier,
      },
    ]);
    if (enc.status !== 'ok' || !enc.shareCode) return { odds: null, reason: 'Not offered' };

    const dec = await target.decode(enc.shareCode);
    const match = dec.selections.find(
      (s) => s.rawMarketId === leg.rawMarketId && s.rawOutcomeId === leg.rawOutcomeId,
    );
    if (dec.status !== 'ok' || !match || !Number.isFinite(match.odds)) {
      return { odds: null, reason: 'Not offered' };
    }
    return match.isLocked ? { odds: match.odds, locked: true, reason: 'Closed' } : { odds: match.odds };
  } catch (err) {
    console.error(`[oddsCompare] ${target.slug} lookup failed:`, err);
    return { odds: null, reason: 'Lookup failed' };
  }
}

export async function compareOdds(
  sourceSlug: string,
  selections: NormalizedSelection[],
): Promise<OddsComparison> {
  const source = getPlatform(sourceSlug)!;
  const targets = comparablePlatforms().filter((p) => p.slug !== sourceSlug);
  const legsIn = selections.slice(0, MAX_LEGS);

  const legs: LegComparison[] = legsIn.map((l) => ({
    homeTeam: l.homeTeam,
    awayTeam: l.awayTeam,
    market: l.market,
    kickoffAt: l.kickoffAt,
    sourceOdds: l.odds,
    quotes: { [sourceSlug]: { odds: l.odds, locked: l.isLocked || undefined } },
    bestSlug: null,
    bestOdds: null,
    gainPct: null,
  }));

  // Small worker pool: legs x targets lookups, a few at a time.
  const jobs = legsIn.flatMap((leg, i) => targets.map((t) => ({ i, leg, t })));
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, jobs.length) }, async () => {
      while (next < jobs.length) {
        const job = jobs[next++];
        legs[job.i].quotes[job.t.slug] = await quoteOnPlatform(job.t, job.leg);
      }
    }),
  );

  for (const leg of legs) {
    let best: { slug: string; odds: number } | null = null;
    for (const [slug, q] of Object.entries(leg.quotes)) {
      if (q.odds === null || q.locked) continue; // never recommend a closed price
      if (!best || q.odds > best.odds) best = { slug, odds: q.odds };
    }
    if (best) {
      leg.bestSlug = best.slug;
      leg.bestOdds = best.odds;
      leg.gainPct = Math.round((best.odds / leg.sourceOdds - 1) * 1000) / 10;
    }
  }

  const platforms: PlatformTotal[] = [source, ...targets].map((p) => {
    const prices = legs.map((l) => l.quotes[p.slug]);
    const usable = prices.filter((q) => q && q.odds !== null && !q.locked);
    const full = usable.length === legs.length && legs.length > 0;
    const total = full ? usable.reduce((a, q) => a * q!.odds!, 1) : null;
    return {
      slug: p.slug,
      label: p.label,
      coveredLegs: usable.length,
      totalLegs: legs.length,
      totalOdds: total === null ? null : Math.round(total * 100) / 100,
    };
  });

  const full = platforms.filter((p) => p.totalOdds !== null);
  const recommended = full.length ? full.reduce((a, b) => (b.totalOdds! > a.totalOdds! ? b : a)) : null;

  return {
    source: { slug: source.slug, label: source.label },
    legs,
    platforms,
    recommendedSlug: recommended?.slug ?? null,
    truncated: selections.length > MAX_LEGS,
  };
}
