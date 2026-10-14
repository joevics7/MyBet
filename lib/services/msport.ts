// MSport NG adapter (decode + create code). Its own file on purpose: MSport shares SportyBet's
// Sportradar ids and the same paths, but NOT its response shape, request body or client headers,
// which is why the old shared-SportyBet adapter never worked (tested 2026-10-10).
//
// From a 2026-10-14 capture of msport.com:
//  headers : apilevel 2, channel ggself-web-search-1001-0815, clientid WEB, platform WEB, operid 2,
//            deviceid <uuid>, devmem, network, screenwh (SportyBet's site sends none of these)
//  decode  : GET /api/ng/orders/real-sports/order/share/<code>
//            -> { bizCode: 10000, data: { shareCode, bettableBetSlip: [ { event, market, outcome } ] } }
//               event   { eventId, homeTeam, awayTeam, startTime (ms), status, sportId, ... }
//               market  { id (number), description "1x2" | "Over/Under", specifiers "total=1.5" | "" }
//               outcome { id, description "Away" | "Over 1.5", odds (string), isActive }
//            An old code answers { bizCode: 19000, data: null, message: "The code has expired." }.
//            There is no `ticket` and no total odds (we multiply the picks).
//  create  : POST /api/ng/orders/real-sports/order/share
//            body { selections: [ { eventId, marketId: <NUMBER>, specifier: "", outcomeId } ] }
//            -> { bizCode: 10000, data: { shareCode } }
//            (marketId is a number and specifier is "" when there is no line, not null.)
//
// UNCONFIRMED: the capture was a LOGGED-IN browser session (account cookies). We send none, so
// whether MSport answers anonymous server requests is untested. Cloudflare sits in front.
// Result checking is off: the capture is a slip that had not started, so how finished picks are
// reported is unknown.

import { randomUUID } from 'crypto';
import type { DecodeResult, NormalizedSelection } from './types';
import type { EncodeResult, EncodeSelectionInput } from './sportybet';

const BASE = 'https://www.msport.com/api/ng/orders/real-sports/order/share';
const DEVICE_ID = randomUUID(); // MSport's web app sends a per-browser uuid; one per server instance
const HEADERS = {
  Accept: 'application/json',
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36',
  Origin: 'https://www.msport.com',
  Referer: 'https://www.msport.com/ng/web/sports/list/Soccer',
  apilevel: '2',
  channel: 'ggself-web-search-1001-0815',
  clientid: 'WEB',
  platform: 'WEB',
  operid: '2',
  deviceid: DEVICE_ID,
  devmem: '2',
  network: '4g',
  screenwh: '1048x809',
};
const EMPTY: DecodeResult = { status: 'invalid', shareCode: null, selections: [], totalOdds: null, raw: null };
const EXPIRED_BIZ_CODE = 19000;

type Json = Record<string, any>;

export async function decodeMsportCode(code: string): Promise<DecodeResult> {
  const clean = code.trim();
  let json: Json;
  try {
    const res = await fetch(`${BASE}/${encodeURIComponent(clean)}`, { headers: HEADERS, signal: AbortSignal.timeout(8000) });
    if (!res.ok) {
      console.error('[msport decode non-OK]', res.status);
      return EMPTY;
    }
    json = (await res.json()) as Json;
  } catch (err) {
    console.error('[msport decode] failed:', err);
    return EMPTY;
  }

  if (json.bizCode === EXPIRED_BIZ_CODE) return { ...EMPTY, status: 'expired', raw: json };
  const legs: Json[] = Array.isArray(json.data?.bettableBetSlip) ? json.data.bettableBetSlip : [];
  if (json.bizCode !== 10000 || legs.length === 0) {
    console.error('[msport decode] unexpected:', JSON.stringify(json)?.slice(0, 300));
    return { ...EMPTY, raw: json };
  }

  const now = Date.now();
  const selections: NormalizedSelection[] = [];
  for (const l of legs) {
    const e: Json = l.event ?? {};
    const m: Json = l.market ?? {};
    const o: Json = l.outcome ?? {};
    const odds = parseFloat(o.odds);
    if (!e.eventId || !e.homeTeam || !e.awayTeam || !Number.isFinite(odds)) continue;

    const kickoffMs = Number(e.startTime);
    const started = Number.isFinite(kickoffMs) && now >= kickoffMs;
    const mDesc = String(m.description ?? '');
    const oDesc = String(o.description ?? '');
    selections.push({
      externalEventId: String(e.eventId),
      homeTeam: String(e.homeTeam),
      awayTeam: String(e.awayTeam),
      market: oDesc && oDesc !== mDesc ? `${mDesc} - ${oDesc}` : mDesc,
      odds,
      kickoffAt: Number.isFinite(kickoffMs) ? new Date(kickoffMs).toISOString() : null,
      isLocked: started || o.isActive === 0 || m.status === 1,
      matchStatus: started ? 'live' : null,
      isWinning: null,
      rawMarketId: String(m.id),
      rawOutcomeId: String(o.id),
      rawSportId: e.sportId ?? 'sr:sport:1',
      rawSpecifier: m.specifiers ? String(m.specifiers) : undefined,
    });
  }
  if (selections.length === 0) return { ...EMPTY, raw: json };

  const total = selections.reduce((a, s) => a * s.odds, 1);
  return {
    status: 'ok',
    shareCode: json.data.shareCode ?? clean,
    selections,
    totalOdds: Math.round(total * 100) / 100,
    raw: json,
  };
}

export async function encodeMsportSlip(selections: EncodeSelectionInput[]): Promise<EncodeResult> {
  if (selections.length === 0) return { status: 'failed', shareCode: null };
  try {
    const res = await fetch(BASE, {
      method: 'POST',
      headers: { ...HEADERS, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        selections: selections.map((s) => ({
          eventId: s.externalEventId,
          marketId: /^\d+$/.test(s.marketId) ? Number(s.marketId) : s.marketId,
          specifier: s.specifier ?? '',
          outcomeId: s.outcomeId,
        })),
      }),
      signal: AbortSignal.timeout(8000),
    });
    const json = (await res.json().catch(() => null)) as Json | null;
    if (!res.ok || json?.bizCode !== 10000 || !json?.data?.shareCode) {
      console.error('[msport encode non-OK]', res.status, JSON.stringify(json)?.slice(0, 300));
      return { status: 'failed', shareCode: null };
    }
    return { status: 'ok', shareCode: String(json.data.shareCode) };
  } catch (err) {
    console.error('[msport encode] failed:', err);
    return { status: 'failed', shareCode: null };
  }
}
