// Bet9ja Decode Service.
//
// Endpoint discovered via network inspection (not documented):
//   GET https://coupon.bet9ja.com/desktop/feapi/CouponAjax/GetBookABetCouponV2
//       ?couponCode={code}&v_cache_version={version}
//
// This is the "Book:" field on sports.bet9ja.com -- a pre-bet share code,
// the same concept as SportyBet's booking code. Bet9ja's separate "Check
// bet:" field (GetCouponDetailsV2) is for a bet already placed under an
// account and is NOT this -- don't confuse the two.
//
// CONFIRMED (2026-09-29): a plain server-side request gets a straight 403
// from Akamai's edge network (errors.edgesuite.net), not even a JS challenge
// page -- most likely IP reputation (Vercel's datacenter ranges). We do NOT
// work around Akamai Bot Manager (no residential proxies, headless browsers
// or forged sensor cookies). Instead, when the server request is blocked, the
// user can load the same URL in their own browser and paste the JSON it shows
// into the Decoder: a pasted response (text starting with "{") is parsed by the
// exact same code below. Untested live -- see docs/PLATFORM_STATUS.md.
//
// 2026-10-14 capture (bet9ja.txt) added: the coupon response shape for a pre-match
// 1X2 pick, the id format ("<eventId>$<sid>", sid "S_1X2_1/X/2" pre-match and
// "LIVES_1X2_*" live) and the create endpoint (POST apigw.bet9ja.com/sportsbook/
// placebet/BookABetV2, form field BETSLIP, response data[0].RIS = the new code).
// Create is NOT implemented: it needs Bet9ja's own event ids and sids (a Bet9ja
// odds feed we have no capture of) and sits behind the same protection.
//
// Also unlike SportyBet, this response does not appear to report
// settlement (win/loss) for finished matches -- so Bet9ja saved codes in
// the Vault will likely need the Fixture/Results Feed rather than being
// able to re-poll this endpoint the way SportyBet's can.

import type { DecodeStatus, NormalizedSelection, DecodeResult } from './types';

const BET9JA_BASE_URL = 'https://coupon.bet9ja.com/desktop/feapi/CouponAjax/GetBookABetCouponV2';
const CACHE_VERSION = '1.329.2.251'; // captured 2026-10-14; may need refreshing

export type Bet9jaDecodeStatus = DecodeStatus;
export type Bet9jaDecodeResult = DecodeResult;

interface RawOutcomeEntry {
  E_ID: number;
  E_C?: string; // Bet9ja's short event code
  marketId?: string;
  SPORT_ID?: number;
  E_NAME: string;
  GN: string;
  V: string;
  STARTDATEUTC: string;
  M_NAME: string;
  SGN: string;
}

interface RawResponse {
  R: string;
  D?: {
    O: Record<string, RawOutcomeEntry>;
  };
}

const EMPTY_RESULT: Bet9jaDecodeResult = {
  status: 'invalid',
  shareCode: null,
  selections: [],
  totalOdds: null,
  raw: null,
};

// Over/Under-style keys embed the line in the key itself, e.g.
// "839196379$S_OU@2.5_O" -- extract it since it's not a separate field.
function extractLine(key: string): string | null {
  const match = key.match(/@([\d.]+)_/);
  return match ? match[1] : null;
}

function splitTeams(eventName: string): [string, string] {
  const parts = eventName.split(' - ');
  if (parts.length === 2) return [parts[0].trim(), parts[1].trim()];
  return [eventName, ''];
}

// Builds the "market - outcome" text the shared parsers understand. 1X2 is confirmed by the
// 2026-10-14 capture (sid S_1X2_1 / S_1X2_X / S_1X2_2). Total goals relies on the "@line" key
// format seen earlier; GG/NG relies on the market name -- both unverified. Anything else keeps
// Bet9ja's own wording and stays unscored. NOTE the draw sign is "X": the old text ("1X2 - X")
// was never recognised as a draw, so Bet9ja draws were never scored.
export function buildBet9jaMarket(key: string, entry: Pick<RawOutcomeEntry, 'M_NAME' | 'SGN'>): string {
  const sid = key.split('$')[1] ?? '';
  const x2 = sid.match(/^(?:LIVE)?S_1X2_([1X2])$/);
  if (x2) return `1X2 - ${x2[1] === '1' ? 'Home' : x2[1] === 'X' ? 'Draw' : 'Away'}`;

  const ou = sid.match(/^(?:LIVE)?S_OU@([\d.]+)_([OU])$/);
  if (ou) return `Total Goals - ${ou[2] === 'O' ? 'Over' : 'Under'} ${ou[1]}`;

  const sign = String(entry.SGN ?? '').trim();
  if (/(gg\/ng|both teams to score|btts)/i.test(entry.M_NAME ?? '')) {
    if (/^(yes|gg|y)$/i.test(sign)) return 'GG/NG - Yes';
    if (/^(no|ng|n)$/i.test(sign)) return 'GG/NG - No';
  }

  const line = extractLine(key);
  return line ? `${entry.M_NAME} ${sign}${line}`.trim() : `${entry.M_NAME} - ${sign}`;
}

export function parseBet9jaCoupon(json: RawResponse, code: string | null): Bet9jaDecodeResult {
  if (json.R !== 'OK' || !json.D || !json.D.O || Object.keys(json.D.O).length === 0) {
    return { ...EMPTY_RESULT, raw: json };
  }
  const selections: NormalizedSelection[] = Object.entries(json.D.O).map(([key, entry]) => {
    const [homeTeam, awayTeam] = splitTeams(entry.E_NAME);
    const line = extractLine(key);
    const isLocked = entry.STARTDATEUTC ? Date.now() >= new Date(entry.STARTDATEUTC).getTime() : false;

    return {
      externalEventId: String(entry.E_ID),
      homeTeam,
      awayTeam,
      market: buildBet9jaMarket(key, entry),
      odds: parseFloat(entry.V),
      kickoffAt: entry.STARTDATEUTC ?? null,
      isLocked,
      matchStatus: null,
      isWinning: null,
      rawMarketId: entry.marketId ? String(entry.marketId) : undefined,
      rawOutcomeId: key.split('$')[1], // Bet9ja's own sid, e.g. S_1X2_1
      rawSportId: entry.SPORT_ID !== undefined ? String(entry.SPORT_ID) : undefined,
      rawSpecifier: line ?? undefined,
    };
  });

  return { status: 'ok', shareCode: code, selections, totalOdds: null, raw: json };
}

export async function decodeBet9jaCode(code: string): Promise<Bet9jaDecodeResult> {
  // Pasted response (the user opened the coupon URL in their own browser): no network call.
  if (code.trim().startsWith('{')) {
    try {
      return parseBet9jaCoupon(JSON.parse(code) as RawResponse, null);
    } catch {
      return EMPTY_RESULT;
    }
  }

  const url = `${BET9JA_BASE_URL}?couponCode=${encodeURIComponent(code)}&v_cache_version=${CACHE_VERSION}`;

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json, text/plain, */*',
        'Accept-Language': 'en-US,en;q=0.9',
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Origin: 'https://sports.bet9ja.com',
        Referer: 'https://sports.bet9ja.com/',
        'sec-ch-ua': '"Chromium";v="120", "Google Chrome";v="120", "Not A(Brand";v="99"',
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': '"Windows"',
        'sec-fetch-dest': 'empty',
        'sec-fetch-mode': 'cors',
        'sec-fetch-site': 'same-site',
      },
      signal: AbortSignal.timeout(8000),
    });
  } catch (err) {
    console.error('[bet9ja decode] fetch threw:', code, err);
    return EMPTY_RESULT;
  }

  // Read as text first (not res.json() directly) so a non-JSON response --
  // e.g. an Akamai challenge/interstitial HTML page -- doesn't crash the
  // route with an unhandled parse error. It gets logged instead.
  const bodyText = await res.text();

  if (!res.ok) {
    console.error(
      '[bet9ja decode] non-OK response:',
      code,
      'status=', res.status,
      'content-type=', res.headers.get('content-type'),
      'body(first 500 chars)=', bodyText.slice(0, 500),
    );
    return EMPTY_RESULT;
  }

  let json: RawResponse;
  try {
    json = JSON.parse(bodyText);
  } catch (err) {
    console.error(
      '[bet9ja decode] JSON parse failed -- likely an Akamai challenge page, not a real API response:',
      code,
      'content-type=', res.headers.get('content-type'),
      'body(first 500 chars)=', bodyText.slice(0, 500),
    );
    return EMPTY_RESULT;
  }

  const parsed = parseBet9jaCoupon(json, code);
  if (parsed.status !== 'ok') {
    console.error('[bet9ja decode] response parsed but not a valid coupon:', code, JSON.stringify(json).slice(0, 500));
  }
  return parsed;
}
