// 22bet NG adapter. Standalone: shares no code with any other bookmaker.
//
// From a 2026-10-14 browser capture of 22bet.ng, which holds ONLY these calls:
//  refresh: POST /service-api/LiveBet-update/Open/UpdateCoupon
//           { NeedUpdateLine: false, Lng, UserId: 0, CfView: 0, Vid, Events: [...], partner: 151 }
//  create : POST /LiveUtil/SaveCoupon    (NOT /service-api/LiveBet/Open/SaveCoupon like Betwinner)
//           { Live: true, Summ: 1, Lng, Vid, CfView: 0, notWait: true, partner: 151,
//             Events: [ { GameId, Type, Coef, Param, PV: "", PlayerId, Kind, InstrumentId, Seconds, Price,
//                         Expired, PlayersDuel: { Team1Ids: null, Team2Ids: null }, Opp1Images: [""], Opp2Images: [""] } ] }
//           -> { Value: "<code>", Success: true }
//  Every request carries an `x-hd` fingerprint token that we do not send or fake.
//
// DECODE IS NOT IMPLEMENTED: the capture has no decode (booking-code lookup) request at all, so its URL,
// body and response are unknown. Rather than assume another site's, decode reports "unsupported" until a
// capture of 22bet's own decode exists.
//
// Create is built from the capture but cannot be reached yet: a pick needs 22bet's own GameId and Type,
// which only a 22bet decode (or a 22bet match feed) can supply. The captured picks were all LIVE (Kind 1,
// Live: true); `Live` is therefore set from the picks' Kind, and a pre-match create is unconfirmed.
// Pick fields travel in rawSpecifier as "p=<Param>;k=<Kind>".

import type { DecodeResult } from './types';
import type { EncodeResult, EncodeSelectionInput } from './sportybet';

const ORIGIN = 'https://22bet.ng';
const PARTNER = 151;
const HEADERS = {
  Accept: 'application/json, text/plain, */*',
  'Content-Type': 'application/json; charset=utf-8',
  Origin: ORIGIN,
  Referer: 'https://22bet.ng/live/football',
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36',
  'x-requested-with': 'XMLHttpRequest',
};

type Json = Record<string, any>;

export async function decode22betCode(_code: string): Promise<DecodeResult> {
  console.error('[22bet decode] not implemented: no decode request in the research');
  return { status: 'unsupported_platform', shareCode: null, selections: [], totalOdds: null, raw: null };
}

async function post(path: string, body: unknown): Promise<Json | null> {
  try {
    const res = await fetch(`${ORIGIN}${path}`, {
      method: 'POST',
      headers: HEADERS,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(8000),
    });
    const text = await res.text();
    if (!res.ok) {
      console.error(`[22bet ${path}] non-OK:`, res.status, text.slice(0, 200));
      return null;
    }
    return JSON.parse(text) as Json;
  } catch (err) {
    console.error(`[22bet ${path}] failed:`, err);
    return null;
  }
}

function unpack(spec: string | undefined): { param: number; kind: number } {
  const p = /p=(-?[\d.]+)/.exec(spec ?? '');
  const k = /k=(\d+)/.exec(spec ?? '');
  return { param: p ? Number(p[1]) : 0, kind: k ? Number(k[1]) : 1 }; // 1 = the only Kind captured
}

export async function encode22betSlip(selections: EncodeSelectionInput[]): Promise<EncodeResult> {
  if (selections.length === 0) return { status: 'failed', shareCode: null };
  if (selections.some((s) => !/^\d+$/.test(s.externalEventId) || !/^\d+$/.test(s.outcomeId) || !(Number(s.odds) > 0))) {
    console.error('[22bet encode] picks must carry 22bet GameId, Type and odds');
    return { status: 'failed', shareCode: null };
  }
  const games = selections.map((s) => s.externalEventId);
  if (new Set(games).size !== games.length) return { status: 'failed', shareCode: null };

  const base = selections.map((s) => {
    const { param, kind } = unpack(s.specifier);
    return {
      GameId: Number(s.externalEventId),
      Type: Number(s.outcomeId),
      Coef: Number(s.odds),
      Param: param,
      PlayerId: 0,
      Kind: kind,
      InstrumentId: 0,
      Seconds: 0,
      Price: 0,
      Expired: 0,
    };
  });
  const vid = base.length > 1 ? 1 : 0;

  // Refresh prices first (body exactly as captured); carry on with ours if it fails.
  const fresh = await post('/service-api/LiveBet-update/Open/UpdateCoupon', {
    NeedUpdateLine: false,
    Lng: 'en',
    UserId: 0,
    CfView: 0,
    Vid: vid,
    Events: base,
    partner: PARTNER,
  });
  const live: Json[] = fresh?.Success === true && Array.isArray(fresh.Value?.Events) ? fresh.Value.Events : [];
  if (live.some((l) => l.Block === true)) {
    console.error('[22bet encode] a pick is blocked on 22bet');
    return { status: 'failed', shareCode: null };
  }
  const events = base.map((ev) => {
    const match = live.find((l) => Number(l.GameId) === ev.GameId && Number(l.Type) === ev.Type);
    const coef = Number(match?.Coef);
    return {
      ...ev,
      Coef: Number.isFinite(coef) && coef > 0 ? coef : ev.Coef,
      PV: '',
      PlayersDuel: { Team1Ids: null, Team2Ids: null },
      Opp1Images: [''],
      Opp2Images: [''],
    };
  });

  const json = await post('/LiveUtil/SaveCoupon', {
    Live: base.every((e) => e.Kind === 1),
    Summ: 1,
    Lng: 'en',
    Vid: vid,
    CfView: 0,
    notWait: true,
    partner: PARTNER,
    Events: events,
  });
  if (!json || json.Success !== true || typeof json.Value !== 'string' || !json.Value) {
    console.error('[22bet encode] failed:', JSON.stringify(json)?.slice(0, 300));
    return { status: 'failed', shareCode: null };
  }
  return { status: 'ok', shareCode: json.Value };
}
