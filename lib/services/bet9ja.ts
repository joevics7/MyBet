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
// from Akamai's edge network (errors.edgesuite.net), not even a JS
// challenge page. This is very likely IP-reputation based -- Vercel's
// serverless IPs are well-known datacenter ranges that Akamai commonly
// blocks outright, independent of headers. Sending a fuller browser-like
// header set (sec-ch-ua, sec-fetch-*, etc.) below as a cheap first attempt,
// but if this keeps 403ing, the real fix is routing through a residential
// proxy or a headless-browser service -- both add cost and complexity, so
// worth confirming this header change doesn't fix it before going there.
//
// Also unlike SportyBet, this response does not appear to report
// settlement (win/loss) for finished matches -- so Bet9ja saved codes in
// the Vault will likely need the Fixture/Results Feed rather than being
// able to re-poll this endpoint the way SportyBet's can.

import type { DecodeStatus, NormalizedSelection, DecodeResult } from './types';

const BET9JA_BASE_URL = 'https://coupon.bet9ja.com/desktop/feapi/CouponAjax/GetBookABetCouponV2';
const CACHE_VERSION = '1.328.0.248'; // captured 2026-09-29; may need refreshing

export type Bet9jaDecodeStatus = DecodeStatus;
export type Bet9jaDecodeResult = DecodeResult;

interface RawOutcomeEntry {
  E_ID: number;
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

export async function decodeBet9jaCode(code: string): Promise<Bet9jaDecodeResult> {
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

  if (json.R !== 'OK' || !json.D || !json.D.O || Object.keys(json.D.O).length === 0) {
    console.error('[bet9ja decode] response parsed but not a valid coupon:', code, JSON.stringify(json).slice(0, 500));
    return { ...EMPTY_RESULT, raw: json };
  }

  const selections: NormalizedSelection[] = Object.entries(json.D.O).map(([key, entry]) => {
    const [homeTeam, awayTeam] = splitTeams(entry.E_NAME);
    const line = extractLine(key);
    const market = line ? `${entry.M_NAME} ${entry.SGN}${line}`.trim() : `${entry.M_NAME} - ${entry.SGN}`;
    const isLocked = entry.STARTDATEUTC ? Date.now() >= new Date(entry.STARTDATEUTC).getTime() : false;

    return {
      externalEventId: String(entry.E_ID),
      homeTeam,
      awayTeam,
      market,
      odds: parseFloat(entry.V),
      kickoffAt: entry.STARTDATEUTC ?? null,
      isLocked,
      matchStatus: null,
      isWinning: null,
    };
  });

  return {
    status: 'ok',
    shareCode: code,
    selections,
    totalOdds: null,
    raw: json,
  };
}
