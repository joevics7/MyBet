// 1xBet NG adapter (DECODE ONLY). A standalone implementation: it shares no engine code
// with any other bookmaker, so a change for another site can never break this one.
//
// Contract, taken from a 2026-10-14 browser capture of https://1xbet.ng (plain JSON POSTs):
//  decode : POST /service-api/LiveBet/Open/GetCoupon   { Guid, Lng: "en", partner: 159 }
//           -> { Success, Value: { Events: [ { GameId, Type, Kind, Param, Coef, Block, Finish, Start (epoch s),
//                Opp1Eng, Opp2Eng, GroupId, GroupName, MarketName, SportId, ... } ] } }
//  refresh: POST /service-api/LiveBet-update/Open/UpdateCoupon  (Group 412, Country 132, Currency 115) -- not used here
//  The site opens a code at https://1xbet.ng/en?coupon-code=<code>.
//
// CREATE IS NOT IMPLEMENTED: the capture has no SaveCoupon (create) request, so its URL and body are unknown
// for this site. Everything else is from a real GetCoupon request and response on pre-match basketball picks
// (Kind 3, SportId 3). Football picks are untested here, so 1X2 mapping rests on the other sites' captures.
//
// Markets: 1X2 is mapped from the site's own text (GroupName "1x2", MarketName W1/X/W2) and football Totals
// from "Total Over/Under (line)". Every other market keeps the site's own wording and is shown unscored.
// Both-to-score is NOT mapped: no capture shows its ids.
//
// NOT SENT, on purpose: cookies and the `x-hd` header (a browser-fingerprint token we do not fake).
// Needs a capture of 1xBet's own create call before create can be added. If the site rejects server
// requests, the log shows "[1xbet ...] non-OK".

import type { DecodeResult, NormalizedSelection } from './types';

const ORIGIN = 'https://1xbet.ng';
const PARTNER = 159;
// `Kind` as captured: Kind 3 on the captured pre-match picks (basketball). Decode keeps each pick's own Kind (see packSpecifier), this is only
// the fallback for a pick that arrives without one.
const DEFAULT_KIND = 3;

const HEADERS = {
  Accept: 'application/json, text/plain, */*',
  'Content-Type': 'application/json',
  Origin: ORIGIN,
  Referer: 'https://1xbet.ng/en/line',
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36',
  'x-requested-with': 'XMLHttpRequest',
};
const EMPTY: DecodeResult = { status: 'invalid', shareCode: null, selections: [], totalOdds: null, raw: null };

type Json = Record<string, any>;

async function post(path: string, body: unknown): Promise<Json | null> {
  try {
    const res = await fetch(`${ORIGIN}/service-api${path}`, {
      method: 'POST',
      headers: HEADERS,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(8000),
    });
    const text = await res.text();
    if (!res.ok) {
      console.error('[1xbet ' + path + '] non-OK:', res.status, text.slice(0, 200));
      return null;
    }
    return JSON.parse(text) as Json;
  } catch (err) {
    console.error('[1xbet ' + path + '] failed:', err);
    return null;
  }
}

// rawSpecifier carries the line and the pick's Kind through the app and back into create: "p=<Param>;k=<Kind>".
export const packSpecifier = (param: number, kind: number) => `p=${param};k=${kind}`;
export function unpackSpecifier(spec: string | undefined): { param: number; kind: number } {
  const p = /p=(-?[\d.]+)/.exec(spec ?? '');
  const k = /k=(\d+)/.exec(spec ?? '');
  return { param: p ? Number(p[1]) : 0, kind: k ? Number(k[1]) : DEFAULT_KIND };
}

// 1X2 from the site's own labels (W1 / X / W2); anything else keeps the site's wording.
export function marketLabel(e: Json): string {
  const group = String(e.GroupName ?? '');
  const market = String(e.MarketName ?? '');
  if (Number(e.GroupId) === 1 && /^1x2$/i.test(group)) {
    if (market === 'W1') return '1X2 - Home';
    if (market === 'X') return '1X2 - Draw';
    if (market === 'W2') return '1X2 - Away';
  }
  // Totals: the site words them "Total Over (2.5)" / "Total Under (2.5)" (group 17, the line is Param;
  // seen in the 1xbet.ng capture). Only football (SportId 1) is relabelled, because the scorer understands
  // goals, not basketball points.
  const total = /^Total (Over|Under)\b/i.exec(market);
  if (Number(e.SportId) === 1 && Number(e.GroupId) === 17 && total && Number(e.Param) > 0) {
    return `Total Goals - ${/over/i.test(total[1]) ? 'Over' : 'Under'} ${e.Param}`;
  }
  const line = Number(e.Param) ? ` (${e.Param})` : '';
  return `${group || 'Market'}${line} - ${market || `type ${e.Type}`}`;
}

function startToIso(e: Json): string | null {
  const s = Number(e.Start);
  if (Number.isFinite(s) && s > 0) return new Date(s * 1000).toISOString();
  const m = String(e.DateStart ?? '').match(/Date\((\d+)\)/);
  return m ? new Date(Number(m[1])).toISOString() : null;
}

export async function decode1xbetCode(code: string): Promise<DecodeResult> {
  const clean = code.trim();
  const json = await post('/LiveBet/Open/GetCoupon', { Guid: clean, Lng: 'en', partner: PARTNER });
  if (!json) return EMPTY;
  if (json.Success !== true || !json.Value) return { ...EMPTY, raw: json };

  const events: Json[] = Array.isArray(json.Value.Events) ? json.Value.Events : [];
  if (events.length === 0) return { ...EMPTY, status: 'expired', raw: json };

  const now = Date.now();
  const selections: NormalizedSelection[] = [];
  for (const e of events) {
    const home = String(e.Opp1Eng ?? e.Opp1 ?? '').trim();
    const away = String(e.Opp2Eng ?? e.Opp2 ?? '').trim();
    const odds = Number(e.Coef);
    if (!home || !away || !Number.isFinite(odds) || odds <= 0) continue;

    const kickoff = startToIso(e);
    const started = kickoff ? now >= Date.parse(kickoff) : false;
    selections.push({
      externalEventId: String(e.GameId),
      homeTeam: home,
      awayTeam: away,
      market: marketLabel(e),
      odds,
      kickoffAt: kickoff,
      isLocked: e.Block === true || e.Finish === true || started,
      matchStatus: e.Finish === true ? 'finished' : started ? 'live' : null,
      isWinning: null,
      rawMarketId: String(e.GroupId),
      rawOutcomeId: String(e.Type),
      rawSportId: String(e.SportId ?? 1),
      rawSpecifier: packSpecifier(Number(e.Param) || 0, Number.isFinite(Number(e.Kind)) ? Number(e.Kind) : DEFAULT_KIND),
    });
  }
  if (selections.length === 0) return { ...EMPTY, raw: json };

  const total = selections.reduce((a, s) => a * s.odds, 1);
  return { status: 'ok', shareCode: clean, selections, totalOdds: Math.round(total * 100) / 100, raw: json };
}
