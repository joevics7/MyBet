// Finds the target platform's own IDs for a pick that came from elsewhere.
//
//  - SportyBet family (SportyBet, Football.com, MSport share Sportradar ids):
//    find the game in SportyBet's live feed by team names + kickoff, then take
//    the REAL market/outcome ids from that event (nothing hard-coded).
//  - Betway: find the game in Betway's live feed, read its Main markets, and
//    take the real outcome id.
//
// Supported picks: 1X2, Over/Under, BTTS (the markets parseMarketString can
// identify safely). Anything else is reported as "not supported", never guessed.

import { normalizeTeamName, similarity } from '@/lib/services/teamMatcher';
import type { EncodeSelectionInput } from '@/lib/services/sportybet';
import type { NormalizedSelection } from '@/lib/services/types';
import type { MarketSelector } from '@/lib/services/confidenceEngine';
import { fetchRawEvents, SPORTYBET, type RawEvent } from '@/lib/odds/sportybetFeed';
import { FEEDS, getJson, page as betwayPage, soccerSportId } from '@/lib/odds/betwayFeed';

export type Resolution =
  | { ok: true; input: EncodeSelectionInput; targetOdds: number | null }
  | { ok: false; reason: string };

type Json = Record<string, any>;
const WINDOW_MS = 2 * 3600 * 1000;

function nameMatch(a: string, b: string): number {
  return similarity(normalizeTeamName(a), normalizeTeamName(b));
}

// ---- SportyBet family -------------------------------------------------------

function findSportyEvent(events: RawEvent[], leg: NormalizedSelection): Json | null {
  const t = leg.kickoffAt ? Date.parse(leg.kickoffAt) : NaN;
  if (leg.externalEventId.startsWith('sr:match:')) {
    const exact = events.find((r) => r.event.eventId === leg.externalEventId);
    if (exact) return exact.event;
  }
  if (Number.isNaN(t)) return null;
  let best: { e: Json; s: number } | null = null;
  for (const r of events) {
    if (Math.abs(Number(r.event.estimateStartTime) - t) > WINDOW_MS) continue;
    const hs = nameMatch(leg.homeTeam, String(r.event.homeTeamName));
    const as = nameMatch(leg.awayTeam, String(r.event.awayTeamName));
    if (hs < 0.7 || as < 0.7) continue;
    if (!best || hs + as > best.s) best = { e: r.event, s: hs + as };
  }
  return best?.e ?? null;
}

function pickOutcome(outs: Json[], ids: string[], desc: RegExp): Json | undefined {
  const o = outs.find((x) => ids.includes(String(x.id))) ?? outs.find((x) => desc.test(String(x.desc ?? '')));
  return o && o.isActive !== 0 && o.isActive !== false ? o : undefined;
}

function sportyInput(event: Json, sel: MarketSelector): Resolution {
  const markets: Json[] = event.markets ?? [];
  let market: Json | undefined;
  let outcome: Json | undefined;

  if (sel.type === '1X2') {
    market = markets.find((m) => String(m.id) === '1');
    const outs: Json[] = market?.outcomes ?? [];
    outcome =
      sel.pick === 'home' ? pickOutcome(outs, ['1'], /^(home|1)$/i)
      : sel.pick === 'draw' ? pickOutcome(outs, ['2'], /^(draw|x)$/i)
      : pickOutcome(outs, ['3'], /^(away|2)$/i);
  } else if (sel.type === 'OVER_UNDER') {
    market = markets.find((m) => String(m.id) === '18' && String(m.specifier ?? '') === `total=${sel.line}`);
    const outs: Json[] = market?.outcomes ?? [];
    outcome = sel.pick === 'over' ? pickOutcome(outs, ['12'], /^over/i) : pickOutcome(outs, ['13'], /^under/i);
  } else {
    market = markets.find((m) => String(m.id) === '29');
    const outs: Json[] = market?.outcomes ?? [];
    outcome = sel.pick === 'yes' ? pickOutcome(outs, ['74'], /^(yes|gg)/i) : pickOutcome(outs, ['76'], /^(no|ng)/i);
  }

  if (!market || !outcome) return { ok: false, reason: 'Market not offered on the target' };
  const odds = Number(outcome.odds);
  return {
    ok: true,
    input: {
      externalEventId: String(event.eventId),
      marketId: String(market.id),
      outcomeId: String(outcome.id),
      specifier: market.specifier ? String(market.specifier) : undefined,
    },
    targetOdds: Number.isFinite(odds) ? odds : null,
  };
}

// One feed fetch covers every leg of the slip.
export async function resolveForSportyFamily(
  legs: { leg: NormalizedSelection; selector: MarketSelector | null }[],
): Promise<Resolution[]> {
  const times = legs.map((l) => (l.leg.kickoffAt ? Date.parse(l.leg.kickoffAt) : NaN)).filter((t) => !Number.isNaN(t));
  if (times.length === 0) return legs.map(() => ({ ok: false, reason: 'No kickoff time to match the game' }));
  const events = await fetchRawEvents(SPORTYBET, Math.min(...times) - 3 * 3600e3, Math.max(...times) + 3 * 3600e3);

  return legs.map(({ leg, selector }) => {
    if (!selector) return { ok: false, reason: 'Market type not supported for conversion yet' } as Resolution;
    const event = findSportyEvent(events, leg);
    if (!event) return { ok: false, reason: 'Game not found on the target' } as Resolution;
    return sportyInput(event, selector);
  });
}

// ---- Betway --------------------------------------------------------------------

async function betwayEvents(minMs: number, maxMs: number): Promise<Json[]> {
  const sportId = await soccerSportId();
  const events: Json[] = [];
  for (let n = 0; n < 24; n++) {
    const p = await betwayPage(sportId, n);
    events.push(...p.events);
    const latest = Math.max(0, ...p.events.map((e) => Number(e.expectedStartEpoch) * 1000));
    if (p.isFinalPage || p.events.length === 0 || latest > maxMs + WINDOW_MS) break;
  }
  return events.filter((e) => {
    const t = Number(e.expectedStartEpoch) * 1000;
    return t >= minMs - WINDOW_MS && t <= maxMs + WINDOW_MS && !e.isLive && !/e-?soccer|esport|virtual/i.test(`${e.league ?? ''} ${e.region ?? ''}`);
  });
}

async function betwayMarkets(eventId: string): Promise<Json | null> {
  const qs = new URLSearchParams({
    eventId,
    marketGroupId: 'Main',
    countryCode: 'NG',
    cultureCode: 'en-US',
    skip: '0',
    take: '20',
    isBuildABetOnly: 'false',
    searchQuery: '',
  });
  try {
    return await getJson<Json>(`${FEEDS}/MarketGroupings/MarketGroupNamesAndMarketsForEvent?${qs}`);
  } catch {
    return null;
  }
}

function betwayInput(event: Json, body: Json, sel: MarketSelector): Resolution {
  const markets: Json[] = body.marketsInGroup ?? [];
  const outcomes: Json[] = body.outcomes ?? [];
  const prices = new Map<string, number>((body.prices ?? []).map((p: Json) => [String(p.outcomeId), Number(p.priceDecimal)]));
  const outsOf = (m: Json) => outcomes.filter((o) => String(o.originalMarketId ?? o.marketId) === String(m.marketId));
  const live = (m: Json) => m.isActive !== false && m.isSuspended !== true && !m.isSquashedParent;
  const nameOf = (m: Json) => String(m.displayName ?? m.name ?? '');

  let outcome: Json | undefined;
  if (sel.type === '1X2') {
    const m = markets.find((x) => live(x) && /^(1x2|win\/draw\/win|match result)$/i.test(nameOf(x).trim()));
    const outs = m ? outsOf(m).sort((a, b) => Number(a.index) - Number(b.index)) : [];
    if (outs.length === 3 && /draw/i.test(String(outs[1].name))) outcome = outs[{ home: 0, draw: 1, away: 2 }[sel.pick]];
  } else if (sel.type === 'OVER_UNDER') {
    const m = markets.find((x) => {
      if (!live(x) || !/total/i.test(nameOf(x)) || /(home|away|team|half|corner|card)/i.test(nameOf(x))) return false;
      const line = nameOf(x).match(/\(([\d.]+)\)/)?.[1] ?? outsOf(x)[0]?.sbv?.match(/[\d.]+/)?.[0];
      return line === String(sel.line);
    });
    outcome = m ? outsOf(m).find((o) => String(o.name).trim().toLowerCase().startsWith(sel.pick)) : undefined;
  } else {
    return { ok: false, reason: 'Both-teams-to-score is not available for Betway conversion yet' };
  }

  const price = outcome ? prices.get(String(outcome.outcomeId)) : undefined;
  if (!outcome || outcome.isTradingActive === false || !price) return { ok: false, reason: 'Market not offered on the target' };
  return { ok: true, input: { externalEventId: String(event.eventId), marketId: String(outcome.marketId), outcomeId: String(outcome.outcomeId) }, targetOdds: price };
}

export async function resolveForBetway(
  legs: { leg: NormalizedSelection; selector: MarketSelector | null }[],
): Promise<Resolution[]> {
  const times = legs.map((l) => (l.leg.kickoffAt ? Date.parse(l.leg.kickoffAt) : NaN)).filter((t) => !Number.isNaN(t));
  if (times.length === 0) return legs.map(() => ({ ok: false, reason: 'No kickoff time to match the game' }));
  const events = await betwayEvents(Math.min(...times), Math.max(...times));
  const marketCache = new Map<string, Json | null>();

  const out: Resolution[] = [];
  for (const { leg, selector } of legs) {
    if (!selector) {
      out.push({ ok: false, reason: 'Market type not supported for conversion yet' });
      continue;
    }
    const t = Date.parse(leg.kickoffAt ?? '');
    let best: { e: Json; s: number } | null = null;
    for (const e of events) {
      if (Math.abs(Number(e.expectedStartEpoch) * 1000 - t) > WINDOW_MS) continue;
      const hs = nameMatch(leg.homeTeam, String(e.homeTeam ?? ''));
      const as = nameMatch(leg.awayTeam, String(e.awayTeam ?? ''));
      if (hs < 0.7 || as < 0.7) continue;
      if (!best || hs + as > best.s) best = { e, s: hs + as };
    }
    if (!best) {
      out.push({ ok: false, reason: 'Game not found on the target' });
      continue;
    }
    const id = String(best.e.eventId);
    if (!marketCache.has(id)) marketCache.set(id, await betwayMarkets(id));
    const body = marketCache.get(id);
    out.push(body ? betwayInput(best.e, body, selector) : { ok: false, reason: 'Could not read the target markets' });
  }
  return out;
}
