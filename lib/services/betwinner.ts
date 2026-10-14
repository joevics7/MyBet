// Betwinner Nigeria adapter (decode + create code).
//
// Contract from real browser captures of betwinner.ng (2026-10-14), all plain JSON POSTs:
//
//  decode : POST /service-api/LiveBet/Open/GetCoupon        { Guid, Lng, partner }
//           -> { Success, Value: { Events: [ { GameId, Type, Kind, Param, Coef, Block, Finish,
//                Start (epoch seconds), Opp1Eng, Opp2Eng, Liga, GroupId, GroupName, MarketName,
//                SportId, ... } ], Coef (total) } }
//  refresh: POST /service-api/LiveBet-update/Open/UpdateCoupon   { Events, partner, Group, Country, ... }
//           -> same shape; Events[].Coef are Betwinner's current prices
//  create : POST /service-api/LiveBet/Open/SaveCoupon       { Events, partner, Summ, Vid, CheckCf, ... }
//           -> { Success, Value: "<code>" }
//
// Betwinner is a 1xBet-family site: a pick is (GameId, Type, Param) -- GameId is Betwinner's own
// numeric id (NOT a Sportradar id), Type is the outcome id inside a market group (GroupId).
// Known group/type ids used below (1xBet convention; 1X2 and W2 are confirmed by the capture):
//   group 1  : 1X2             type 1 = home, 2 = draw, 3 = away
//   group 17 : Total goals     type 9 = over, 10 = under, Param = line      (UNVERIFIED)
//   group 19 : Both to score   type 180 = yes, 181 = no                      (UNVERIFIED)
// Anything else keeps Betwinner's own GroupName/MarketName text and is left unscored.
//
// NOT SENT, on purpose: the captured requests also carried browser cookies and an opaque `x-hd`
// header. We send neither. If Betwinner/Cloudflare rejects server requests without them, decode
// will log "[betwinner ...] non-OK" -- that is the thing to check first (see notes in the PR).
//
// Create-code only works for picks that came from a Betwinner decode (it needs Betwinner's own
// GameId). Creating a code from another platform's slip needs a Betwinner line/feed lookup, which
// the research doesn't cover yet, so Betwinner is NOT a Converter target.

import type { DecodeResult, NormalizedSelection } from './types';
import type { EncodeResult, EncodeSelectionInput } from './sportybet';

const BASE = 'https://betwinner.ng/service-api';
const PARTNER = 152; // the site's partner id, sent by the web app on every request
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36';
const HEADERS = {
  Accept: 'application/json, text/plain, */*',
  'Content-Type': 'application/json',
  Origin: 'https://betwinner.ng',
  Referer: 'https://betwinner.ng/en/line',
  'User-Agent': UA,
  'x-app-n': '__BETTING_APP__',
  'x-svc-source': '__BETTING_APP__',
  'x-requested-with': 'XMLHttpRequest',
  'is-srv': 'false',
};

const EMPTY: DecodeResult = { status: 'invalid', shareCode: null, selections: [], totalOdds: null, raw: null };

type Json = Record<string, any>;

async function post(path: string, body: unknown): Promise<Json | null> {
  try {
    const res = await fetch(`${BASE}${path}`, {
      method: 'POST',
      headers: HEADERS,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(8000),
    });
    const text = await res.text();
    if (!res.ok) {
      console.error(`[betwinner ${path}] non-OK:`, res.status, text.slice(0, 200));
      return null;
    }
    return JSON.parse(text) as Json;
  } catch (err) {
    console.error(`[betwinner ${path}] failed:`, err);
    return null;
  }
}

// ---- helpers (exported for tests) ----------------------------------------------------------

export function buildBetwinnerMarket(e: {
  groupId: number;
  type: number;
  param: number;
  groupName: string;
  marketName: string;
}): string {
  const { groupId, type, param, groupName, marketName } = e;

  if (groupId === 1 && (type === 1 || type === 2 || type === 3)) {
    return `1X2 - ${type === 1 ? 'Home' : type === 2 ? 'Draw' : 'Away'}`;
  }
  if (groupId === 17 && (type === 9 || type === 10) && param > 0) {
    return `Total Goals - ${type === 9 ? 'Over' : 'Under'} ${param}`;
  }
  if (groupId === 19 && (type === 180 || type === 181)) {
    return `GG/NG - ${type === 180 ? 'Yes' : 'No'}`;
  }
  // Unknown market: keep Betwinner's own wording, plus the line so it isn't lost.
  const line = param ? ` (${param})` : '';
  return `${groupName || 'Market'}${line} - ${marketName || `type ${type}`}`;
}

function startToIso(e: Json): string | null {
  const s = Number(e.Start);
  if (Number.isFinite(s) && s > 0) return new Date(s * 1000).toISOString();
  const m = String(e.DateStart ?? '').match(/Date\((\d+)\)/);
  return m ? new Date(Number(m[1])).toISOString() : null;
}

// ---- decode ------------------------------------------------------------------------------------

export async function decodeBetwinnerCode(code: string): Promise<DecodeResult> {
  const clean = code.trim();
  const json = await post('/LiveBet/Open/GetCoupon', { Guid: clean, Lng: 'en', partner: PARTNER });

  if (!json) return EMPTY;
  if (json.Success !== true || !json.Value) {
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
    if (!home || !away || !Number.isFinite(odds) || odds <= 0) continue;

    const kickoff = startToIso(e);
    const param = Number(e.Param) || 0;
    const started = kickoff ? now >= Date.parse(kickoff) : false;

    selections.push({
      externalEventId: String(e.GameId),
      homeTeam: home,
      awayTeam: away,
      market: buildBetwinnerMarket({
        groupId: Number(e.GroupId),
        type: Number(e.Type),
        param,
        groupName: String(e.GroupName ?? ''),
        marketName: String(e.MarketName ?? ''),
      }),
      odds,
      kickoffAt: kickoff,
      isLocked: e.Block === true || e.Finish === true || started,
      matchStatus: e.Finish === true ? 'finished' : started ? 'live' : null,
      isWinning: null,
      rawMarketId: String(e.GroupId),
      rawOutcomeId: String(e.Type),
      rawSportId: String(e.SportId ?? 1),
      rawSpecifier: param ? String(param) : undefined,
    });
  }
  if (selections.length === 0) return { ...EMPTY, raw: json };

  const total = selections.reduce((a, s) => a * s.odds, 1);
  return { status: 'ok', shareCode: clean, selections, totalOdds: Math.round(total * 100) / 100, raw: json };
}

// ---- create code ---------------------------------------------------------------------------------

const toEvent = (s: EncodeSelectionInput, coef: number) => ({
  GameId: Number(s.externalEventId),
  Type: Number(s.outcomeId),
  Coef: coef,
  Param: s.specifier ? Number(s.specifier) : 0,
  PV: null,
  PlayerId: 0,
  Kind: 3,
  InstrumentId: 0,
  Seconds: 0,
  Price: 0,
  Expired: 0,
  PlayersDuel: [],
});

export async function encodeBetwinnerSlip(selections: EncodeSelectionInput[]): Promise<EncodeResult> {
  if (selections.length === 0) return { status: 'failed', shareCode: null };

  // Needs Betwinner's own numeric GameId and a price to send.
  if (selections.some((s) => !/^\d+$/.test(s.externalEventId) || !/^\d+$/.test(s.outcomeId) || !(Number(s.odds) > 0))) {
    console.error('[betwinner encode] picks must come from a Betwinner decode (numeric GameId, Type, odds)');
    return { status: 'failed', shareCode: null };
  }
  const games = selections.map((s) => s.externalEventId);
  if (new Set(games).size !== games.length) {
    console.error('[betwinner encode] two picks from the same game');
    return { status: 'failed', shareCode: null };
  }

  let events = selections.map((s) => toEvent(s, Number(s.odds)));

  // Ask Betwinner for the current prices first, so a price that moved since the original decode
  // doesn't make the save fail. If this call fails we carry on with the prices we have.
  const fresh = await post('/LiveBet-update/Open/UpdateCoupon', {
    Events: events,
    Vid: 0,
    partner: PARTNER,
    Lng: 'en',
    CfView: 0,
    CalcSystemsMin: false,
    Group: 526,
    Country: 132,
    Currency: 115,
    SaleBetId: 0,
    IsPowerBet: false,
    WithLobby: false,
  });
  const live: Json[] = fresh?.Success === true && Array.isArray(fresh.Value?.Events) ? fresh.Value.Events : [];
  if (live.some((l) => l.Block === true)) {
    console.error('[betwinner encode] a pick is blocked on Betwinner');
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
    console.error('[betwinner encode] failed:', JSON.stringify(json)?.slice(0, 300));
    return { status: 'failed', shareCode: null };
  }
  return { status: 'ok', shareCode: json.Value };
}
