// 1xBet NG adapter (decode + create code). A standalone implementation: it shares no engine code
// with any other bookmaker, so a change for another site can never break this one.
//
// Contract, taken from browser captures of https://1xbet.ng (plain JSON POSTs):
//  decode : POST /service-api/LiveBet/Open/GetCoupon   { Guid, Lng: "en", partner: 159 }
//           -> { Success, Value: { Events: [ { GameId, Type, Kind, Param, PlayerId, Coef, Block, Finish, Start (epoch s),
//                Opp1Eng, Opp2Eng, GroupId, GroupName, MarketName, SportId, ... } ] } }
//  refresh: POST /service-api/LiveBet-update/Open/UpdateCoupon
//           { Events, Vid, partner: 159, Lng, CfView: 0, CalcSystemsMin: false, Group: 412, Country: 132, Currency: 115,
//             SaleBetId: 0, IsPowerBet: false, WithLobby: false }   -> { Success, Value: { Events: [ { Coef, Block, ... } ] } }
//  create : POST /service-api/LiveBet/Open/SaveCoupon
//           { notWait: true, CheckCf: 1, partner: 159, AntiExpressCoef: 1, Summ: 1000, Events, Vid }
//           -> { Value: "V8U1E", Id: 0, Success: true, Error: "", ErrorCode: 0 }
//  The site opens a code at https://1xbet.ng/en?coupon-code=<code>.
//
// Create was added 2026-10-21 from a 2026-10-20 capture that holds, for one pre-match football pick (1X2 "W2", Kind 3,
// SportId 1): the UpdateCoupon request and response, the SaveCoupon request and response (code V8U1E), and the GetCoupon
// request and response for that code. Every request carries `x-app-n` and `x-svc-source` = __BETTING_APP__ (sent here), plus
// an `x-hd` browser-fingerprint token and cookies (incl. a Cloudflare `cf_clearance`) that are NOT sent: we do not fake them.
// 1xbet.ng sits behind Cloudflare, so a server request may be challenged; the log then shows "[1xbet <path>] non-OK".
//
// What the captures prove and what they do not:
//  - A SINGLE-pick create (Vid 0) and decode are captured for football. A MULTI-pick create is NOT captured here: Vid 1 for more
//    than one pick is what the Betwinner/Paripesa captures (same engine) show, and is used here. Confirm on the first multi-pick split.
//  - The refresh `Group` is 412 in the capture and the `x-dt` response header said 412 too, so the adapter uses the latest
//    `x-dt` it has seen and falls back to 412. The refresh is best-effort: if it fails, create carries on with the prices it has.
//  - A pick is (GameId, Type, Param, Kind, PlayerId). GameId is this site's own numeric id (not Sportradar), so create only works
//    for picks decoded from 1xBet (the Splitter's flow). Not a Converter target: that needs a 1xBet match feed, not captured.
//
// Markets: 1X2 is mapped from the site's own text (GroupName "1x2", MarketName W1/X/W2) and football Totals
// from "Total Over/Under (line)". Every other market keeps the site's own wording and is shown unscored.
// Both-to-score is NOT mapped: no capture shows its ids.
//
// Splitter: create calls are queued one at a time inside this file, because the Splitter starts every group's create at once.
// This is a precaution, not a confirmed cause of any failure.

import type { DecodeResult, NormalizedSelection } from './types';
import type { EncodeResult, EncodeSelectionInput } from './sportybet';

const ORIGIN = 'https://1xbet.ng';
const PARTNER = 159;
const FALLBACK_GROUP = 412;
const COUNTRY = 132;
const CURRENCY = 115;
// `Kind` as captured: Kind 3 on the captured pre-match picks. Decode keeps each pick's own Kind (see packSpecifier), this is only
// the fallback for a pick that arrives without one.
const DEFAULT_KIND = 3;

const HEADERS = {
  Accept: 'application/json, text/plain, */*',
  'Content-Type': 'application/json',
  Origin: ORIGIN,
  Referer: 'https://1xbet.ng/en',
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36',
  'x-requested-with': 'XMLHttpRequest',
  'x-app-n': '__BETTING_APP__',
  'x-svc-source': '__BETTING_APP__',
};
const EMPTY: DecodeResult = { status: 'invalid', shareCode: null, selections: [], totalOdds: null, raw: null };

type Json = Record<string, any>;

// The site's current price-refresh group, learned from the `x-dt` response header.
let currentGroup = FALLBACK_GROUP;

async function post(path: string, body: unknown): Promise<Json | null> {
  try {
    const res = await fetch(`${ORIGIN}/service-api${path}`, {
      method: 'POST',
      headers: HEADERS,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(8000),
    });
    const dt = Number(res.headers.get('x-dt'));
    if (Number.isInteger(dt) && dt > 0) currentGroup = dt;
    const text = await res.text();
    if (!res.ok) {
      // 403/429/503 or an HTML page means Cloudflare / the browser-fingerprint check stopped us, not a bad request.
      const blocked = res.status === 403 || res.status === 429 || res.status === 503 || /^\s*</.test(text);
      console.error('[1xbet ' + path + (blocked ? '] BLOCKED by Cloudflare/fingerprint check:' : '] non-OK:'), res.status, text.slice(0, 200));
      return null;
    }
    if (/^\s*</.test(text)) {
      console.error('[1xbet ' + path + '] BLOCKED: got an HTML page instead of JSON (Cloudflare challenge)', text.slice(0, 120));
      return null;
    }
    return JSON.parse(text) as Json;
  } catch (err) {
    console.error('[1xbet ' + path + '] failed:', err);
    return null;
  }
}

// rawSpecifier carries what create needs besides the ids: "p=<Param>;k=<Kind>;pl=<PlayerId>".
export const packSpecifier = (param: number, kind: number, playerId = 0) => `p=${param};k=${kind};pl=${playerId}`;
export function unpackSpecifier(spec: string | undefined): { param: number; kind: number; playerId: number } {
  const p = /p=(-?[\d.]+)/.exec(spec ?? '');
  const k = /k=(\d+)/.exec(spec ?? '');
  const pl = /pl=(\d+)/.exec(spec ?? '');
  return { param: p ? Number(p[1]) : 0, kind: k ? Number(k[1]) : DEFAULT_KIND, playerId: pl ? Number(pl[1]) : 0 };
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
  // An outright has no second team: show "<group> - <market>" (the line is already in the market text).
  if (!String(e.Opp2Eng ?? e.Opp2 ?? '').trim()) return `${group || 'Market'} - ${market || `type ${e.Type}`}`;
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
  if (json.Success !== true || !json.Value) {
    console.error('[1xbet decode] refused:', JSON.stringify({ Error: json.Error, ErrorCode: json.ErrorCode }));
    return { ...EMPTY, raw: json };
  }

  const events: Json[] = Array.isArray(json.Value.Events) ? json.Value.Events : [];
  if (events.length === 0) return { ...EMPTY, status: 'expired', raw: json };

  const now = Date.now();
  const selections: NormalizedSelection[] = [];
  for (const e of events) {
    const home = String(e.Opp1Eng ?? e.Opp1 ?? '').trim();
    const away = String(e.Opp2Eng ?? e.Opp2 ?? '').trim();
    const odds = Number(e.Coef);
    if (!home || e.GameId == null || !Number.isFinite(odds) || odds <= 0) continue;

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
      rawSpecifier: packSpecifier(
        Number(e.Param) || 0,
        Number.isFinite(Number(e.Kind)) ? Number(e.Kind) : DEFAULT_KIND,
        Number(e.PlayerId) || 0,
      ),
    });
  }
  if (selections.length === 0) return { ...EMPTY, raw: json };

  const total = selections.reduce((a, s) => a * s.odds, 1);
  return { status: 'ok', shareCode: clean, selections, totalOdds: Math.round(total * 100) / 100, raw: json };
}

const toEvent = (s: EncodeSelectionInput, coef: number) => {
  const { param, kind, playerId } = unpackSpecifier(s.specifier);
  return {
    GameId: Number(s.externalEventId),
    Type: Number(s.outcomeId),
    Coef: coef,
    Param: param,
    PV: null,
    PlayerId: playerId,
    Kind: kind,
    InstrumentId: 0,
    Seconds: 0,
    Price: 0,
    Expired: 0,
    PlayersDuel: [],
  };
};

// The Splitter starts every group's create at once; run them one at a time instead (see the note at the top).
let queue: Promise<unknown> = Promise.resolve();
function oneAtATime<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task, task);
  queue = run.catch(() => undefined);
  return run;
}

async function createCode(selections: EncodeSelectionInput[]): Promise<EncodeResult> {
  let events = selections.map((s) => toEvent(s, Number(s.odds)));
  const vid = events.length > 1 ? 1 : 0; // 0 = single (captured on 1xBet); 1 = multiple (captured on Betwinner/Paripesa)

  // Refresh prices first so a price that moved since the decode does not fail the save (the save sends CheckCf: 1).
  // Body as captured. If this call fails we carry on with the prices we have.
  const fresh = await post('/LiveBet-update/Open/UpdateCoupon', {
    Events: events,
    Vid: vid,
    partner: PARTNER,
    Lng: 'en',
    CfView: 0,
    CalcSystemsMin: false,
    Group: currentGroup,
    Country: COUNTRY,
    Currency: CURRENCY,
    SaleBetId: 0,
    IsPowerBet: false,
    WithLobby: false,
  });
  const live: Json[] = fresh?.Success === true && Array.isArray(fresh.Value?.Events) ? fresh.Value.Events : [];
  if (live.some((l) => l.Block === true)) {
    console.error('[1xbet encode] a pick is blocked on 1xbet');
    return { status: 'failed', shareCode: null };
  }
  events = events.map((ev) => {
    const match = live.find((l) => Number(l.GameId) === ev.GameId && Number(l.Type) === ev.Type && Number(l.Param) === ev.Param);
    const coef = Number(match?.Coef);
    return Number.isFinite(coef) && coef > 0 ? { ...ev, Coef: coef } : ev;
  });

  const json = await post('/LiveBet/Open/SaveCoupon', {
    notWait: true,
    CheckCf: 1,
    partner: PARTNER,
    AntiExpressCoef: 1,
    Summ: 1000,
    Events: events,
    Vid: vid,
  });
  if (!json || json.Success !== true || typeof json.Value !== 'string' || !json.Value) {
    console.error('[1xbet encode] failed:', JSON.stringify(json)?.slice(0, 300));
    return { status: 'failed', shareCode: null };
  }
  return { status: 'ok', shareCode: json.Value };
}

export async function encode1xbetSlip(selections: EncodeSelectionInput[]): Promise<EncodeResult> {
  if (selections.length === 0) return { status: 'failed', shareCode: null };
  if (selections.some((s) => !/^\d+$/.test(s.externalEventId) || !/^\d+$/.test(s.outcomeId) || !(Number(s.odds) > 0))) {
    console.error('[1xbet encode] picks must come from a decode on this site (numeric GameId, Type, odds)');
    return { status: 'failed', shareCode: null };
  }
  return oneAtATime(() => createCode(selections));
}
