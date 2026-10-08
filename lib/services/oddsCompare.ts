// Odds comparison across bookmakers, with a value flag.
//
// Price sources per pick (merged; a direct price always beats an aggregator
// price for the same bookmaker):
//   1. The source platform itself (the odds on the code you pasted).
//   2. SportyBet family (SportyBet, Football.com, MSport): same Sportradar
//      IDs, so we create a one-pick code on the other platform and decode it.
//   3. Betway NG: matched by team names + kickoff, price read from its feed.
//   4. OddsPapi: hundreds of bookmakers worldwide (needs ODDSPAPI_API_KEY),
//      plus Pinnacle as a sharp reference price.
// Steps 3-4 cover 1X2, Over/Under and BTTS only (the markets we can parse).
//
// Value flag: our model's probability for the pick (the same Poisson model
// the confidence score uses) against the best available price.
//   valuePct   = modelProb x bestOdds - 1      (model-based)
//   vsSharpPct = sharpProb x bestOdds - 1      (market-based: does the best
//                price beat Pinnacle's no-margin line?)

import type { NormalizedSelection } from './types';
import { PLATFORMS, getPlatform, type PlatformAdapter } from './platforms';
import { parseMarketString } from './splitter';
import { findFixtureByTeamNames } from './teamMatcher';
import { computeMatchProbabilities, scoreForMarket } from './confidenceEngine';
import { lookupOutsideQuotes, isOddsPapiConfigured, type Pick } from './oddsPapi';
import { lookupBetwayPrice } from './betwayBrowse';

export const MAX_LEGS = 12;
const LEG_CONCURRENCY = 3;
const BETWAY_SLUG = 'betway';

export interface Quote {
  odds: number | null;
  reason?: string; // why there's no price (not offered, closed, ...)
  locked?: boolean;
}

export type ValueLabel = 'value' | 'slight' | 'none';

export interface LegComparison {
  homeTeam: string;
  awayTeam: string;
  market: string;
  kickoffAt: string | null;
  sourceOdds: number;
  quotes: Record<string, Quote>; // by bookmaker slug, includes the source
  bestSlug: string | null;
  bestOdds: number | null;
  gainPct: number | null; // best vs source price, %
  modelProb: number | null;
  sharpProb: number | null;
  valuePct: number | null;
  valueLabel: ValueLabel | null;
  vsSharpPct: number | null;
}

export interface PlatformTotal {
  slug: string;
  label: string;
  coveredLegs: number;
  totalLegs: number;
  totalOdds: number | null; // only when every pick has a price
}

export interface OddsComparison {
  source: { slug: string; label: string };
  labels: Record<string, string>;
  legs: LegComparison[];
  platforms: PlatformTotal[];
  recommendedSlug: string | null;
  truncated: boolean;
  outsideOdds: boolean; // false when ODDSPAPI_API_KEY isn't set
}

export function comparablePlatforms(): PlatformAdapter[] {
  return PLATFORMS.filter((p) => p.oddsLookup);
}

const norm = (slug: string) => slug.toLowerCase().replace(/[^a-z0-9]/g, '');

// ---- 2. SportyBet-family direct lookup ------------------------------------

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
    if (dec.status !== 'ok' || !match || !Number.isFinite(match.odds)) return { odds: null, reason: 'Not offered' };
    return match.isLocked ? { odds: match.odds, locked: true, reason: 'Closed' } : { odds: match.odds };
  } catch (err) {
    console.error(`[oddsCompare] ${target.slug} lookup failed:`, err);
    return { odds: null, reason: 'Lookup failed' };
  }
}

// ---- model probability ------------------------------------------------------

async function modelProbability(leg: NormalizedSelection, pick: Pick): Promise<number | null> {
  if (!leg.kickoffAt) return null;
  try {
    const fixture = await findFixtureByTeamNames(leg.homeTeam, leg.awayTeam, leg.kickoffAt);
    if (!fixture) return null;
    const lines = pick.type === 'OVER_UNDER' ? [pick.line] : [2.5];
    const out = await computeMatchProbabilities(fixture.homeTeamId, fixture.awayTeamId, lines, undefined, fixture.provider);
    if (out.status !== 'ok') return null;
    return scoreForMarket(pick, out.data.probs)?.probability ?? null;
  } catch (err) {
    console.error('[oddsCompare] model probability failed:', err);
    return null;
  }
}

// ---- one pick ---------------------------------------------------------------

async function compareLeg(
  sourceSlug: string,
  targets: PlatformAdapter[],
  leg: NormalizedSelection,
  labels: Record<string, string>,
): Promise<LegComparison> {
  const pick = parseMarketString(leg.market, leg.homeTeam, leg.awayTeam) as Pick | null;
  const quotes: Record<string, Quote> = { [sourceSlug]: { odds: leg.odds, locked: leg.isLocked || undefined } };
  let sharpProb: number | null = null;

  const betwayJob = async () => {
    if (sourceSlug === BETWAY_SLUG) return;
    if (!pick) return void (quotes[BETWAY_SLUG] = { odds: null, reason: 'Market not supported' });
    const r = await lookupBetwayPrice(leg, pick);
    quotes[BETWAY_SLUG] = 'odds' in r ? { odds: r.odds } : { odds: null, reason: r.reason };
  };

  const outsideJob = async () => {
    if (!pick || !isOddsPapiConfigured()) return;
    const r = await lookupOutsideQuotes(leg, pick);
    if ('reason' in r) return;
    sharpProb = r.sharpProb;
    const taken = new Set(Object.keys(quotes).map(norm));
    for (const [slug, price] of Object.entries(r.prices)) {
      if (taken.has(norm(slug))) continue; // direct price wins
      quotes[slug] = { odds: price };
      labels[slug] = r.labels[slug];
    }
  };

  const [, , , modelProb] = await Promise.all([
    Promise.all(targets.map(async (t) => void (quotes[t.slug] = await quoteOnPlatform(t, leg)))),
    betwayJob(),
    outsideJob(),
    pick ? modelProbability(leg, pick) : Promise.resolve(null),
  ]);

  let best: { slug: string; odds: number } | null = null;
  for (const [slug, q] of Object.entries(quotes)) {
    if (q.odds === null || q.locked) continue; // never recommend a closed price
    if (!best || q.odds > best.odds) best = { slug, odds: q.odds };
  }

  const r1 = (n: number) => Math.round(n * 10) / 10;
  const valuePct = best && modelProb !== null ? r1((modelProb * best.odds - 1) * 100) : null;
  return {
    homeTeam: leg.homeTeam,
    awayTeam: leg.awayTeam,
    market: leg.market,
    kickoffAt: leg.kickoffAt,
    sourceOdds: leg.odds,
    quotes,
    bestSlug: best?.slug ?? null,
    bestOdds: best?.odds ?? null,
    gainPct: best ? r1((best.odds / leg.odds - 1) * 100) : null,
    modelProb: modelProb === null ? null : Math.round(modelProb * 1000) / 1000,
    sharpProb: sharpProb === null ? null : Math.round(sharpProb * 1000) / 1000,
    valuePct,
    valueLabel: valuePct === null ? null : valuePct >= 5 ? 'value' : valuePct >= 0 ? 'slight' : 'none',
    vsSharpPct: best && sharpProb !== null ? r1((sharpProb * best.odds - 1) * 100) : null,
  };
}

// ---- whole slip -------------------------------------------------------------

export async function compareOdds(sourceSlug: string, selections: NormalizedSelection[]): Promise<OddsComparison> {
  const source = getPlatform(sourceSlug)!;
  const targets = comparablePlatforms().filter((p) => p.slug !== sourceSlug);
  const legsIn = selections.slice(0, MAX_LEGS);

  const labels: Record<string, string> = Object.fromEntries(PLATFORMS.map((p) => [p.slug, p.label]));
  labels[BETWAY_SLUG] = 'Betway NG';

  const legs: LegComparison[] = new Array(legsIn.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(LEG_CONCURRENCY, legsIn.length) }, async () => {
      while (next < legsIn.length) {
        const i = next++;
        legs[i] = await compareLeg(sourceSlug, targets, legsIn[i], labels);
      }
    }),
  );

  const slugs = Array.from(new Set(legs.flatMap((l) => Object.keys(l.quotes))));
  const all: PlatformTotal[] = slugs.map((slug) => {
    const usable = legs.map((l) => l.quotes[slug]).filter((q) => q && q.odds !== null && !q.locked);
    const full = legs.length > 0 && usable.length === legs.length;
    const total = full ? usable.reduce((a, q) => a * q!.odds!, 1) : null;
    return {
      slug,
      label: labels[slug] ?? slug,
      coveredLegs: usable.length,
      totalLegs: legs.length,
      totalOdds: total === null ? null : Math.round(total * 100) / 100,
    };
  });

  all.sort((a, b) => (b.totalOdds ?? -1) - (a.totalOdds ?? -1) || b.coveredLegs - a.coveredLegs);
  const platforms = all.filter((p, i) => p.slug === sourceSlug || p.coveredLegs > 0).slice(0, 25);
  if (!platforms.some((p) => p.slug === sourceSlug)) platforms.push(all.find((p) => p.slug === sourceSlug)!);

  const full = platforms.filter((p) => p.totalOdds !== null);
  const recommended = full.length ? full.reduce((a, b) => (b.totalOdds! > a.totalOdds! ? b : a)) : null;

  return {
    source: { slug: source.slug, label: source.label },
    labels,
    legs,
    platforms,
    recommendedSlug: recommended?.slug ?? null,
    truncated: selections.length > MAX_LEGS,
    outsideOdds: isOddsPapiConfigured(),
  };
}
