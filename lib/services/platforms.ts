// Single registry of supported bookmakers. Every tool (decoder, splitter,
// vault) reads from here, so adding a platform means adding one entry.
//
//  canEncode  -> we can generate a new booking code for it (Splitter returns codes)
//  canSettle  -> the decode response reports per-leg results (Vault can auto-check)
//  verified   -> request/response confirmed against real traffic

import type { DecodeResult } from './types';
import {
  decodeShareCode,
  encodeShareSlip,
  SPORTYBET_CONFIG,
  type EncodeResult,
  type EncodeSelectionInput,
  type ShareApiConfig,
} from './sportybet';
import { decodeBet9jaCode } from './bet9ja';
import { decodeBangbetCode, encodeBangbetSlip } from './bangbet';
import { decodeBetwinnerCode, encodeBetwinnerSlip } from './betwinner';
import { decodeAfropariCode, encodeAfropariSlip } from './afropari';
import { decodeParipesaCode, encodeParipesaSlip } from './paripesa';
import { decode1xbetCode, encode1xbetSlip } from './onexbet';
import { decode22betCode, encode22betSlip } from './twentytwobet';
import { decodeFootballcomCode, encodeFootballcomSlip } from './footballcom';
import { decodeHelabetCode, encodeHelabetSlip } from './helabet';
import { decodeMelbetCode, encodeMelbetSlip } from './melbet';
import { decodeMsportCode, encodeMsportSlip } from './msport';
import { decodeStakeBet } from './stake';
import { decodeBetwayCode, encodeBetwaySlip } from './betway';
import { decodeBetpawaCode, encodeBetpawaSlip } from './betpawa';

export interface PlatformAdapter {
  slug: string;
  label: string;
  decode: (code: string) => Promise<DecodeResult>;
  encode?: (selections: EncodeSelectionInput[]) => Promise<EncodeResult>;
  canSettle: boolean;
  verified: boolean;
  // Where the user pastes/loads a code. {code} is substituted.
  deepLink?: string;
}

function shareFamily(
  slug: string,
  label: string,
  cfg: ShareApiConfig,
  opts: { canSettle: boolean; verified: boolean; deepLink?: string },
): PlatformAdapter {
  return {
    slug,
    label,
    decode: (code) => decodeShareCode(cfg, code),
    encode: (sels) => encodeShareSlip(cfg, sels),
    ...opts,
  };
}

export const PLATFORMS: PlatformAdapter[] = [
  shareFamily('sportybet', 'SportyBet', SPORTYBET_CONFIG, {
    canSettle: true,
    verified: true,
    deepLink: 'https://www.sportybet.com/ng/?shareCode={code}',
  }),
  // SportyBet white-label: same paths and ids, but its own client headers and decode response
  // shape, so it has its own adapter (lib/services/footballcom.ts). SportyBet's code is untouched.
  {
    slug: 'footballcom',
    label: 'Football.com',
    decode: decodeFootballcomCode,
    encode: encodeFootballcomSlip,
    canSettle: true,
    verified: false,
    deepLink: 'https://www.football.com/ng/?shareCode={code}',
  },
  // MSport: same paths and Sportradar ids as SportyBet, but its own response shape, request body and
  // client headers, so it has its own adapter (lib/services/msport.ts), rebuilt 2026-10-14 from a
  // capture. The old shared adapter failed the 2026-10-10 test. Not yet run live; the capture was a
  // logged-in session, anonymous access is untested. Result checking stays off.
  { slug: 'msport', label: 'MSport', decode: decodeMsportCode, encode: encodeMsportSlip, canSettle: false, verified: false },
  // Decoding works (tested 2026-10-10). 2026-10-14: switched to the confirmed bookingV2 endpoint,
  // kickoff time is now filled from the odds endpoint (it was missing, which blanked every
  // score), and market text is built from Sportradar ids. Create-code added from the captured
  // /bet/share request -- NOT yet tested live, so it's kept out of the Converter's targets.
  {
    slug: 'bangbet',
    label: 'Bangbet',
    decode: decodeBangbetCode,
    encode: encodeBangbetSlip,
    canSettle: false,
    verified: true,
    deepLink: 'https://www.bangbet.com/static/share/book.html?{code}',
  },
  // TESTED 2026-10-10: decoding works. Decode + create. Result checking stays off.
  {
    slug: 'betway',
    label: 'Betway',
    decode: decodeBetwayCode,
    encode: encodeBetwaySlip,
    canSettle: false,
    verified: true,
  },
  // Betwinner NG: own file (lib/services/betwinner.ts), fully captured -- decode request AND response, refresh, create.
  // NOT yet tested live. Create only for slips decoded from Betwinner (e.g. the Splitter); not a Converter target.
  {
    slug: 'betwinner',
    label: 'Betwinner',
    decode: decodeBetwinnerCode,
    encode: encodeBetwinnerSlip,
    canSettle: false,
    verified: false,
  },
  // Afropari (afropari.com, partner 300): own file (lib/services/afropari.ts), built from a 2026-10-20 capture that holds
  // GetCoupon (decode request AND response), UpdateCoupon and SaveCoupon (single pick). Create only for slips decoded
  // from Afropari (the Splitter); not a Converter target. NOT yet run live.
  { slug: 'afropari', label: 'Afropari', decode: decodeAfropariCode, encode: encodeAfropariSlip, canSettle: false, verified: false },
  // 22bet NG: decode NOT implemented (no decode request in the research). Create is built from its capture
  // (own path, /LiveUtil/SaveCoupon) but needs 22bet's own match ids, so it is unreachable until decode exists.
  { slug: '22bet', label: '22bet', decode: decode22betCode, encode: encode22betSlip, canSettle: false, verified: false },
  // 1xBet NG: own file (lib/services/onexbet.ts). Decode from a real capture; create added 2026-10-21 from a 2026-10-20
  // capture (UpdateCoupon + SaveCoupon, code V8U1E, single pre-match football pick). Create only for slips decoded from 1xBet
  // (the Splitter); not a Converter target. NOT run live.
  { slug: '1xbet', label: '1xBet', decode: decode1xbetCode, encode: encode1xbetSlip, canSettle: false, verified: false, deepLink: 'https://1xbet.ng/en?coupon-code={code}' },
  // Paripesa NG (the "Parissa" research file): own file (lib/services/paripesa.ts). Create captured for real
  // (code 238NQ); decode request captured but its response is not in the file, so the response shape is assumed
  // from the Betwinner/Helabet captures -- UNCONFIRMED. NOT run live.
  { slug: 'paripesa', label: 'Paripesa', decode: decodeParipesaCode, encode: encodeParipesaSlip, canSettle: false, verified: false },
  // Helabet NG: own file (lib/services/helabet.ts). Decode + create from a real capture
  // (live basketball slip), NOT run live. Create only for slips decoded from Helabet.
  { slug: 'helabet', label: 'Helabet', decode: decodeHelabetCode, encode: encodeHelabetSlip, canSettle: false, verified: false },
  // Melbet: own file (lib/services/melbet.ts). Capture had the decode request but no
  // response body, so decode assumes Betwinner's shape -- UNCONFIRMED. Create from the capture, not run live.
  { slug: 'melbet', label: 'Melbet', decode: decodeMelbetCode, encode: encodeMelbetSlip, canSettle: false, verified: false },
  // Betpawa NG, added 2026-10-14 from a capture. Create-code contract is confirmed by the capture (JSON),
  // NOT run live. Decode: responses are protobuf with no public schema and the capture had no decode
  // response body, so the leg layout is unmapped -- decode returns 'invalid' and logs the structure
  // until it is mapped (see lib/services/betpawa.ts). Hidden from the Telegram pickers meanwhile.
  { slug: 'betpawa', label: 'Betpawa', decode: decodeBetpawaCode, encode: encodeBetpawaSlip, canSettle: false, verified: false },
  // Decode only. Input is a share link or bet ID ("sport:12345678"), not a
  // booking code. No create path exists. TESTED 2026-10-10: does NOT work.
  { slug: 'stake', label: 'Stake', decode: decodeStakeBet, canSettle: false, verified: false },
  // Decode-only; known to fail from our server (geo/bot protection). Parked.
  // TESTED 2026-10-10: does NOT work.
  { slug: 'bet9ja', label: 'Bet9ja', decode: decodeBet9jaCode, canSettle: false, verified: false },
];

export function getPlatform(slug: string | undefined | null): PlatformAdapter | undefined {
  return PLATFORMS.find((p) => p.slug === slug?.trim().toLowerCase());
}

export function deepLinkFor(slug: string, code: string): string | null {
  const p = getPlatform(slug);
  return p?.deepLink ? p.deepLink.replace('{code}', encodeURIComponent(code)) : null;
}
