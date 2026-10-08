// Betway Nigeria adapter (decode + encode).
//
// Contract source: the public repo Slipcheck-Demo/backend, docs/betway-api.md,
// which documents live tests (2026-09-16) of Betway's anonymous JSON API:
//   decode: POST https://www.betway.com.ng/appsynapse/bet-api-sr/v2/Betting/FindBookABet
//   encode: POST https://www.betway.com.ng/appsynapse/bet-api-sr/v1/Betting/BookABet
// No auth, no cookies, plain JSON. Not yet verified by us from our own server.
//
// Behaviours documented there and handled here:
//  - 400 BookABetLimitExceeded (6000359): transient -> retry with backoff
//  - 400 BookABetInvalidCode (6000331): bad code
//  - 400 BookABetSelectionsExpired (6000332): code exists, nothing bettable
//  - a leg is only bettable if all six active/suspended/finished flags agree
//  - encode does NOT reject two outcomes from the same event -> we do
//  - encode is deterministic: the same outcomes always give the same code
//
// Betway outcome IDs are Betway's own, so encode only works for slips that
// were decoded from Betway (the Splitter's flow: decode X -> split -> encode X).

import type { DecodeResult, NormalizedSelection } from './types';
import type { EncodeResult, EncodeSelectionInput } from './sportybet';

const BASE = 'https://www.betway.com.ng/appsynapse/bet-api-sr';
const HEADERS = { 'Content-Type': 'application/json', Accept: 'application/json' };
const RETRY_CODE = 6000359;
const INVALID_CODE = 6000331;
const EXPIRED_CODE = 6000332;

const EMPTY: DecodeResult = { status: 'invalid', shareCode: null, selections: [], totalOdds: null, raw: null };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Json = Record<string, any>;

async function post(path: string, body: unknown): Promise<{ status: number; json: Json | null }> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(`${BASE}${path}`, {
        method: 'POST',
        headers: HEADERS,
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(8000),
      });
      const json = (await res.json().catch(() => null)) as Json | null;
      if (json?.errorCode === RETRY_CODE && attempt < 2) {
        await sleep(1500 * (attempt + 1)); // throttled: back off and retry
        continue;
      }
      return { status: res.status, json };
    } catch (err) {
      console.error('[betway] fetch threw:', err);
      return { status: 0, json: null };
    }
  }
  return { status: 429, json: null };
}

function splitEvent(name: string): [string, string] | null {
  const parts = name.split(/\s+(?:vs\.?|v|-)\s+/i);
  return parts.length === 2 ? [parts[0].trim(), parts[1].trim()] : null;
}

// Shapes Betway's names into strings the shared parsers understand:
//  "1X2" + "Chelsea FC"  -> "1X2 - Home"/"Away"/"Draw"
//  "Total (5.5)" + "Over" -> "Total Goals - Over 5.5"
function buildMarket(marketName: string, outcomeName: string, home: string, away: string): string {
  const out = outcomeName.trim();
  if (/^1x2$/i.test(marketName.trim()) || /win\/draw\/win/i.test(marketName)) {
    if (/draw/i.test(out)) return `${marketName} - Draw`;
    if (out.toLowerCase() === home.toLowerCase()) return `${marketName} - Home`;
    if (out.toLowerCase() === away.toLowerCase()) return `${marketName} - Away`;
  }
  const line = marketName.match(/\(([\d.]+)\)/)?.[1];
  if (/^(over|under)$/i.test(out) && line) return `${marketName.replace(/\s*\([\d.]+\)/, '')} - ${out} ${line}`;
  return `${marketName} - ${out}`;
}

export async function decodeBetwayCode(code: string): Promise<DecodeResult> {
  const { status, json } = await post('/v2/Betting/FindBookABet', {
    countryCode: 'NG',
    bookingCode: code.trim(),
    cultureCode: 'en-US',
  });

  if (json?.errorCode === EXPIRED_CODE) return { ...EMPTY, status: 'expired', raw: json };
  if (!json || status !== 200 || !Array.isArray(json.selections)) {
    if (json?.errorCode !== INVALID_CODE) console.error('[betway decode] unexpected:', status, JSON.stringify(json)?.slice(0, 300));
    return { ...EMPTY, raw: json };
  }
  const legs: Json[] = json.selections;
  if (legs.length === 0) return { ...EMPTY, status: 'expired', raw: json };

  const now = Date.now();
  const selections: NormalizedSelection[] = [];
  for (const s of legs) {
    const teams = splitEvent(String(s.eventName ?? ''));
    const odds = Number(s.priceDecimal);
    if (!teams || !Number.isFinite(odds)) continue;

    const kickoffMs = typeof s.eventEpoch === 'number' ? s.eventEpoch * 1000 : null;
    // All six signals must agree for a leg to be bettable.
    const dead =
      s.isMarketActive === false ||
      s.isEventActive === false ||
      s.isOutcomeActive === false ||
      s.market?.isSuspended === true ||
      s.sportEvent?.isFinished === true ||
      s.outcome?.isTradingActive === false;

    selections.push({
      externalEventId: String(s.eventId),
      homeTeam: teams[0],
      awayTeam: teams[1],
      market: buildMarket(String(s.marketName ?? ''), String(s.outcomeName ?? ''), teams[0], teams[1]),
      odds,
      kickoffAt: kickoffMs ? new Date(kickoffMs).toISOString() : null,
      isLocked: dead || (kickoffMs !== null && now >= kickoffMs),
      matchStatus: s.sportEvent?.isFinished ? 'finished' : null,
      isWinning: null,
      rawMarketId: String(s.marketId),
      rawOutcomeId: String(s.outcomeId),
    });
  }
  if (selections.length === 0) return { ...EMPTY, raw: json };

  const total = selections.reduce((a, s) => a * s.odds, 1);
  return { status: 'ok', shareCode: code.trim(), selections, totalOdds: Math.round(total * 100) / 100, raw: json };
}

export async function encodeBetwaySlip(selections: EncodeSelectionInput[]): Promise<EncodeResult> {
  if (selections.length === 0) return { status: 'failed', shareCode: null };

  // Betway doesn't validate this itself.
  const events = selections.map((s) => s.externalEventId);
  if (new Set(events).size !== events.length) {
    console.error('[betway encode] conflicting selections from the same event');
    return { status: 'failed', shareCode: null };
  }

  const { status, json } = await post('/v1/Betting/BookABet', {
    cultureCode: 'en-US',
    countryCode: 'NG',
    isSingleBet: selections.length === 1,
    outcomes: selections.map((s) => ({ outcomeId: s.outcomeId })),
  });
  if (status !== 200 || !json?.bookingCode) {
    console.error('[betway encode] failed:', status, JSON.stringify(json)?.slice(0, 300));
    return { status: 'failed', shareCode: null };
  }
  return { status: 'ok', shareCode: String(json.bookingCode) };
}
