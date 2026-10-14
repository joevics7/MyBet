// Melbet adapter (decode + create code). A standalone implementation: it shares no engine code
// with any other bookmaker, so a change for another site can never break this one.
//
// Contract, taken from a 2026-10-14 browser capture of https://melbet.com (plain JSON POSTs):
//  decode : POST /service-api/LiveBet/Open/GetCoupon   { Guid, Lng: "en", partner: 8 }
//           -> { Success, Value: { Events: [ { GameId, Type, Kind, Param, Coef, Block, Finish, Start (epoch s),
//                Opp1Eng, Opp2Eng, GroupId, GroupName, MarketName, SportId, ... } ] } }
//  refresh: POST /service-api/LiveBet-update/Open/UpdateCoupon   (current prices; same shape back)
//  create : POST /service-api/LiveBet/Open/SaveCoupon   -> { Success, Value: "<code>" }
// A pick is (GameId, Type, Param, Kind). GameId is this site's own numeric id (not Sportradar), so
// create only works for picks decoded from this same site.
//// The capture has the decode REQUEST but no decode RESPONSE, so decode reads the response the way the other
// 1xBet-engine captures (Betwinner, Helabet) show it. UNCONFIRMED for Melbet. Captured on melbet.com; if
// Nigerian users use melbet.ng the origin needs changing. The refresh call sends IsExpressBoost: true as
// the site does. Live picks only; pre-match is untested. Not a Converter target.
// Markets: only 1X2 is mapped to a scoreable label, because the capture shows the site's own text for
// it (GroupName "1x2", MarketName "W2" for Type 3). Every other market keeps the site's own wording
// and is shown unscored. Over/Under and Both-to-score are NOT mapped: no capture shows their ids.
//
// NOT SENT, on purpose: cookies and the `x-hd` header (a browser-fingerprint token we do not fake).
// If the site rejects server requests, the log shows "[melbet ...] non-OK".

import type { DecodeResult, NormalizedSelection } from './types';
import type { EncodeResult, EncodeSelectionInput } from './sportybet';

const ORIGIN = 'https://melbet.com';
const PARTNER = 8;
const UPDATE_EXTRAS = { Group: 62, Country: 132, Currency: 115, IsExpressBoost: true };
// `Kind` as captured: Kind 1 on the captured picks, which were LIVE games. Decode keeps each pick's own Kind (see packSpecifier), this is only
// the fallback for a pick that arrives without one.
const DEFAULT_KIND = 1;

const HEADERS = {
  Accept: 'application/json, text/plain, */*',
  'Content-Type': 'application/json',
  Origin: ORIGIN,
  Referer: 'https://melbet.com/en',
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
      console.error('[melbet ' + path + '] non-OK:', res.status, text.slice(0, 200));
      return null;
    }
    return JSON.parse(text) as Json;
  } catch (err) {
    console.error('[melbet ' + path + '] failed:', err);
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
  const line = Number(e.Param) ? ` (${e.Param})` : '';
  return `${group || 'Market'}${line} - ${market || `type ${e.Type}`}`;
}

function startToIso(e: Json): string | null {
  const s = Number(e.Start);
  if (Number.isFinite(s) && s > 0) return new Date(s * 1000).toISOString();
  const m = String(e.DateStart ?? '').match(/Date\((\d+)\)/);
  return m ? new Date(Number(m[1])).toISOString() : null;
}

export async function decodeMelbetCode(code: string): Promise<DecodeResult> {
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

const toEvent = (s: EncodeSelectionInput, coef: number) => {
  const { param, kind } = unpackSpecifier(s.specifier);
  return {
    GameId: Number(s.externalEventId),
    Type: Number(s.outcomeId),
    Coef: coef,
    Param: param,
    PV: null,
    PlayerId: 0,
    Kind: kind,
    InstrumentId: 0,
    Seconds: 0,
    Price: 0,
    Expired: 0,
    PlayersDuel: [],
  };
};

export async function encodeMelbetSlip(selections: EncodeSelectionInput[]): Promise<EncodeResult> {
  if (selections.length === 0) return { status: 'failed', shareCode: null };
  if (selections.some((s) => !/^\d+$/.test(s.externalEventId) || !/^\d+$/.test(s.outcomeId) || !(Number(s.odds) > 0))) {
    console.error('[melbet encode] picks must come from a decode on this site (numeric GameId, Type, odds)');
    return { status: 'failed', shareCode: null };
  }
  const games = selections.map((s) => s.externalEventId);
  if (new Set(games).size !== games.length) {
    console.error('[melbet encode] two picks from the same game');
    return { status: 'failed', shareCode: null };
  }

  let events = selections.map((s) => toEvent(s, Number(s.odds)));

  // Refresh prices first so a price that moved since the decode does not fail the save. If this call
  // fails we carry on with the prices we have.
  const fresh = await post('/LiveBet-update/Open/UpdateCoupon', {
    Events: events,
    Vid: events.length > 1 ? 1 : 0,
    partner: PARTNER,
    Lng: 'en',
    CfView: 0,
    CalcSystemsMin: false,
    ...UPDATE_EXTRAS,
    SaleBetId: 0,
    IsPowerBet: false,
    WithLobby: false,
    
  });
  const live: Json[] = fresh?.Success === true && Array.isArray(fresh.Value?.Events) ? fresh.Value.Events : [];
  if (live.some((l) => l.Block === true)) {
    console.error('[melbet encode] a pick is blocked on melbet');
    return { status: 'failed', shareCode: null };
  }
  events = events.map((ev) => {
    const match = live.find((l) => Number(l.GameId) === ev.GameId && Number(l.Type) === ev.Type);
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
    Vid: events.length > 1 ? 1 : 0,
  });
  if (!json || json.Success !== true || typeof json.Value !== 'string' || !json.Value) {
    console.error('[melbet encode] failed:', JSON.stringify(json)?.slice(0, 300));
    return { status: 'failed', shareCode: null };
  }
  return { status: 'ok', shareCode: json.Value };
}
