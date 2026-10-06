// Bangbet Decode Service.
//
// Endpoint (from open-source converters): POST https://bet-api.bangbet.com/api/bet/booking
// with form body bookingCode=CODE.
//
// UNVERIFIED RESPONSE SHAPE: the research gave the request but not a sample
// response. The parser below is deliberately tolerant -- it walks the JSON for
// the array of legs and picks fields by several likely names. On the first real
// call, check the server log line "[bangbet decode] raw" and tighten the field
// names. Anything it can't read is dropped rather than guessed.
//
// Encode is NOT implemented: no create endpoint was confirmed. Bangbet slips
// are shown as a pick list the user re-enters by hand.

import type { DecodeResult, NormalizedSelection } from './types';

const BANGBET_URL = 'https://bet-api.bangbet.com/api/bet/booking';

const EMPTY: DecodeResult = { status: 'invalid', shareCode: null, selections: [], totalOdds: null, raw: null };

type Json = Record<string, unknown>;

function pick(o: Json, keys: string[]): unknown {
  for (const k of keys) if (o[k] !== undefined && o[k] !== null && o[k] !== '') return o[k];
  return undefined;
}

// Finds the first array of objects that look like bet legs (have a home and away team).
function findLegs(node: unknown, depth = 0): Json[] | null {
  if (depth > 5 || node == null) return null;
  if (Array.isArray(node)) {
    const objs = node.filter((n): n is Json => typeof n === 'object' && n !== null);
    if (objs.length > 0 && objs.some((o) => pick(o, ['homeTeamName', 'homeTeam', 'home', 'homeName']) !== undefined)) {
      return objs;
    }
    for (const n of node) {
      const r = findLegs(n, depth + 1);
      if (r) return r;
    }
    return null;
  }
  if (typeof node === 'object') {
    for (const v of Object.values(node as Json)) {
      const r = findLegs(v, depth + 1);
      if (r) return r;
    }
  }
  return null;
}

function toIso(v: unknown): string | null {
  const n = typeof v === 'string' ? Number(v) : (v as number);
  if (typeof n === 'number' && Number.isFinite(n)) return new Date(n < 1e12 ? n * 1000 : n).toISOString();
  if (typeof v === 'string' && !Number.isNaN(Date.parse(v))) return new Date(v).toISOString();
  return null;
}

export async function decodeBangbetCode(code: string): Promise<DecodeResult> {
  let res: Response;
  try {
    res = await fetch(BANGBET_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json, text/plain, */*',
        Origin: 'https://www.bangbet.com',
        Referer: 'https://www.bangbet.com/',
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
      body: new URLSearchParams({ bookingCode: code }).toString(),
      signal: AbortSignal.timeout(8000),
    });
  } catch (err) {
    console.error('[bangbet decode] fetch threw:', err);
    return EMPTY;
  }

  const text = await res.text();
  if (!res.ok) {
    console.error('[bangbet decode] non-OK:', res.status, text.slice(0, 300));
    return EMPTY;
  }

  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    console.error('[bangbet decode] not JSON:', text.slice(0, 300));
    return EMPTY;
  }
  console.log('[bangbet decode] raw', text.slice(0, 1500));

  const legs = findLegs(json);
  if (!legs) return { ...EMPTY, raw: json };

  const now = Date.now();
  const selections: NormalizedSelection[] = [];
  for (const leg of legs) {
    const home = pick(leg, ['homeTeamName', 'homeTeam', 'home', 'homeName']);
    const away = pick(leg, ['awayTeamName', 'awayTeam', 'away', 'awayName']);
    const odds = Number(pick(leg, ['odds', 'odd', 'price']));
    if (!home || !away || !Number.isFinite(odds)) continue;

    const marketName = pick(leg, ['marketName', 'marketDesc', 'market', 'betTypeName']);
    const outcomeName = pick(leg, ['outcomeName', 'outcomeDesc', 'outcome', 'selectionName', 'specifier']);
    const kickoff = toIso(pick(leg, ['startTime', 'estimateStartTime', 'matchTime', 'kickoffTime']));

    selections.push({
      externalEventId: String(pick(leg, ['eventId', 'matchId', 'id']) ?? `${home}-${away}`),
      homeTeam: String(home),
      awayTeam: String(away),
      market: [marketName, outcomeName].filter(Boolean).join(' - ') || 'Unknown market',
      odds,
      kickoffAt: kickoff,
      isLocked: kickoff ? now >= Date.parse(kickoff) : false,
      matchStatus: null,
      isWinning: null,
    });
  }

  if (selections.length === 0) return { ...EMPTY, raw: json };

  const total = selections.reduce((acc, s) => acc * s.odds, 1);
  return { status: 'ok', shareCode: code, selections, totalOdds: Math.round(total * 100) / 100, raw: json };
}
