// Football.com adapter (decode + create code). Its own file on purpose: it shares SportyBet's
// paths and Sportradar ids but NOT its response shape or client headers, and SportyBet's code
// (lib/services/sportybet.ts) must not change because of Football.com.
//
// From a 2026-10-14 capture of football.com:
//  - requests carry clientid/platform = "wap" (SportyBet's site sends "web")
//  - decode  GET  /api/ng/orders/share/<code>: no `isAvailable`, no `ticket`, no total odds. The
//    picks are the markets left inside data.outcomes[], each holding only the chosen outcome.
//  - create  POST /api/ng/orders/share  body { selections: [{ eventId, marketId, specifier, outcomeId }] }
//            -> { bizCode: 10000, data: { shareCode } }   (same body as SportyBet)
// Not sent: cookies, `sporty-referer`, empty `operid`. Untested live.

import type { DecodeResult, NormalizedSelection } from './types';
import type { EncodeResult, EncodeSelectionInput } from './sportybet';

const BASE = 'https://www.football.com/api/ng/orders/share';
const HEADERS = {
  Accept: 'application/json',
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Origin: 'https://www.football.com',
  Referer: 'https://www.football.com/ng/',
  clientid: 'wap',
  platform: 'wap',
};
const EMPTY: DecodeResult = { status: 'invalid', shareCode: null, selections: [], totalOdds: null, raw: null };

type Json = Record<string, any>;

export async function decodeFootballcomCode(code: string): Promise<DecodeResult> {
  let json: Json;
  try {
    const res = await fetch(`${BASE}/${encodeURIComponent(code.trim())}`, { headers: HEADERS, signal: AbortSignal.timeout(8000) });
    if (!res.ok) {
      console.error('[footballcom decode non-OK]', res.status);
      return EMPTY;
    }
    json = (await res.json()) as Json;
  } catch (err) {
    console.error('[footballcom decode] failed:', err);
    return EMPTY;
  }
  if (json.bizCode !== 10000 || !json.data) return { ...EMPTY, raw: json };

  const events: Json[] = Array.isArray(json.data.outcomes) ? json.data.outcomes : [];
  const selections: NormalizedSelection[] = [];
  for (const e of events) {
    const kickoffMs = Number(e.estimateStartTime);
    for (const m of e.markets ?? []) {
      for (const o of m.outcomes ?? []) {
        const odds = parseFloat(o.odds);
        if (!Number.isFinite(odds)) continue;
        selections.push({
          externalEventId: String(e.eventId),
          homeTeam: String(e.homeTeamName),
          awayTeam: String(e.awayTeamName),
          market: o.desc && o.desc !== m.desc ? `${m.desc} - ${o.desc}` : String(m.desc),
          odds,
          kickoffAt: Number.isFinite(kickoffMs) ? new Date(kickoffMs).toISOString() : null,
          isLocked: Number.isFinite(kickoffMs) ? Date.now() >= kickoffMs : false,
          matchStatus: e.matchStatus ?? null,
          isWinning: typeof o.isWinning === 'number' ? o.isWinning === 1 : null,
          rawMarketId: String(m.id),
          rawOutcomeId: String(o.id),
          rawSportId: e.sport?.id ?? 'sr:sport:1',
          rawSpecifier: m.specifier,
        });
      }
    }
  }
  if (selections.length === 0) return { ...EMPTY, shareCode: json.data.shareCode ?? null, raw: json };

  const total = selections.reduce((a, s) => a * s.odds, 1);
  return { status: 'ok', shareCode: json.data.shareCode ?? code.trim(), selections, totalOdds: Math.round(total * 100) / 100, raw: json };
}

export async function encodeFootballcomSlip(selections: EncodeSelectionInput[]): Promise<EncodeResult> {
  if (selections.length === 0) return { status: 'failed', shareCode: null };
  try {
    const res = await fetch(BASE, {
      method: 'POST',
      headers: { ...HEADERS, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        selections: selections.map((s) => ({
          eventId: s.externalEventId,
          marketId: s.marketId,
          specifier: s.specifier ?? null,
          outcomeId: s.outcomeId,
        })),
      }),
      signal: AbortSignal.timeout(8000),
    });
    const json = (await res.json().catch(() => null)) as Json | null;
    if (!res.ok || json?.bizCode !== 10000 || !json?.data?.shareCode) {
      console.error('[footballcom encode non-OK]', res.status, JSON.stringify(json)?.slice(0, 300));
      return { status: 'failed', shareCode: null };
    }
    return { status: 'ok', shareCode: String(json.data.shareCode) };
  } catch (err) {
    console.error('[footballcom encode] failed:', err);
    return { status: 'failed', shareCode: null };
  }
}
