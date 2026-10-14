// Betpawa Nigeria adapter (decode + create code).
//
// Contract from a browser capture of betpawa.ng (2026-10-13). Same-origin API, no login:
//
//  create : POST /api/sportsbook/v3/booking-number            (JSON in, JSON out)
//           body    { selections: { selections: [ { type: "SINGLE", selections: [<priceId>] }, ... ] } }
//           returns { code: "19N75ZY" }
//           One { type: "SINGLE" } entry per leg was captured for a 2-leg slip. Whether other
//           `type` values exist (e.g. for multiples) is not known.
//  decode : GET  /api/sportsbook/v3/booking-number/<code>     (response is PROTOBUF)
//           message com.betpawa.sportsbook.bff.dto.BookingCodeEventPriceListProto, schema file
//           price.proto (not public). A bad/unknown code answered with a 2-byte body.
//  price  : POST /api/sportsbook/v3/prices/list  body { selections: [{ type: "SINGLE", selections: [<priceId>] }] }
//           -> protobuf EventPriceListProto. Not used yet.
//  feed   : GET  /api/sportsbook/v4/events/lists/by-queries?q=<json>  -> protobuf EventsBatchResponseV4Proto.
//           Not used yet (it is what a Converter target would need).
//
// A pick is identified by Betpawa's own numeric PRICE id (e.g. 1569473175), not a Sportradar id,
// so create only works for slips decoded from Betpawa (the Splitter's flow). Converting TO Betpawa
// needs the feed above plus its response layout.
//
// NOT SENT, on purpose: the capture also carried cookies (incl. a Cloudflare `__cf_bm`) and an
// `x-device-fingerprint` header. We send neither and do not try to fake them. If Cloudflare rejects
// server-side requests, the log shows "[betpawa ... non-OK]".
//
// DECODE STATUS: the request is built and the protobuf is read, but the capture did not include a
// decode RESPONSE body, so the field layout of BookingCodeEventPriceListProto is unknown. Until a
// real response is available, decode logs the response structure (see `describe`) and returns
// 'invalid' rather than guessing at fields. See mapBooking().

import type { DecodeResult, NormalizedSelection } from './types';
import type { EncodeResult, EncodeSelectionInput } from './sportybet';
import { describe, parseMessage, type PbField } from './protobuf';

const BASE = 'https://www.betpawa.ng/api/sportsbook/v3';
const COMMON = {
  Origin: 'https://www.betpawa.ng',
  Referer: 'https://www.betpawa.ng/',
  'x-pawa-brand': 'betpawa-nigeria',
  'x-pawa-language': 'en',
  devicetype: 'web',
};
const EMPTY: DecodeResult = { status: 'invalid', shareCode: null, selections: [], totalOdds: null, raw: null };

// Fill this in once a real decode response is available. It must turn the parsed protobuf
// into one NormalizedSelection per leg, with rawOutcomeId = Betpawa's price id (that is what
// encodeBetpawaSlip needs). Returning [] means "layout not mapped yet".
function mapBooking(_fields: PbField[]): NormalizedSelection[] {
  return [];
}

export async function decodeBetpawaCode(code: string): Promise<DecodeResult> {
  const clean = code.trim().toUpperCase();
  if (!/^[A-Z0-9]{4,12}$/.test(clean)) return EMPTY;

  let res: Response;
  try {
    res = await fetch(`${BASE}/booking-number/${encodeURIComponent(clean)}`, {
      headers: { ...COMMON, Accept: 'application/x-protobuf', 'Content-Type': 'application/x-protobuf' },
      signal: AbortSignal.timeout(8000),
    });
  } catch (err) {
    console.error('[betpawa decode] fetch threw:', err);
    return EMPTY;
  }
  if (!res.ok) {
    console.error('[betpawa decode non-OK]', res.status);
    return EMPTY;
  }

  const buf = new Uint8Array(await res.arrayBuffer());
  if (buf.length <= 2) return EMPTY; // what an unknown code returned in the capture

  const fields = parseMessage(buf);
  if (!fields) {
    console.error('[betpawa decode] response is not valid protobuf, first bytes:', Buffer.from(buf.subarray(0, 24)).toString('hex'));
    return EMPTY;
  }

  const selections = mapBooking(fields);
  if (selections.length === 0) {
    // Layout not mapped (or no legs). Log the structure so the mapping can be written from it.
    console.error('[betpawa decode] unmapped response layout:', JSON.stringify(describe(buf)).slice(0, 4000));
    return { ...EMPTY, raw: null };
  }

  const total = selections.reduce((a, s) => a * s.odds, 1);
  return { status: 'ok', shareCode: clean, selections, totalOdds: Math.round(total * 100) / 100, raw: null };
}

export async function encodeBetpawaSlip(selections: EncodeSelectionInput[]): Promise<EncodeResult> {
  if (selections.length === 0) return { status: 'failed', shareCode: null };

  const ids = selections.map((s) => Number(s.outcomeId));
  if (ids.some((n) => !Number.isFinite(n) || n <= 0)) {
    // Not a Betpawa price id: the slip did not come from a Betpawa decode.
    console.error('[betpawa encode] selection without a Betpawa price id');
    return { status: 'failed', shareCode: null };
  }

  try {
    const res = await fetch(`${BASE}/booking-number`, {
      method: 'POST',
      headers: { ...COMMON, Accept: '*/*', 'Content-Type': 'application/json' },
      body: JSON.stringify({ selections: { selections: ids.map((id) => ({ type: 'SINGLE', selections: [id] })) } }),
      signal: AbortSignal.timeout(8000),
    });
    const json = (await res.json().catch(() => null)) as { code?: string } | null;
    if (!res.ok || !json?.code) {
      console.error('[betpawa encode non-OK]', res.status, JSON.stringify(json)?.slice(0, 300));
      return { status: 'failed', shareCode: null };
    }
    return { status: 'ok', shareCode: String(json.code) };
  } catch (err) {
    console.error('[betpawa encode] fetch threw:', err);
    return { status: 'failed', shareCode: null };
  }
}
