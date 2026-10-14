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
import {
  decodeBetwinnerCode,
  encodeBetwinnerSlip,
  decodeAfropariCode,
  encodeAfropariSlip,
  decode22betCode,
} from './xbetFamily';
import { decodeFootballcomCode, encodeFootballcomSlip } from './footballcom';
import { decodeHelabetCode, encodeHelabetSlip } from './helabet';
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
  // Same Sportradar-style IDs; path differs. Response shape assumed to match
  // SportyBet's. TESTED 2026-10-10: decoding does NOT work. Hidden from the
  // Telegram pickers until it's fixed.
  shareFamily(
    'msport',
    'MSport',
    {
      baseUrl: 'https://www.msport.com/api/ng/orders/real-sports/order/share',
      origin: 'https://www.msport.com',
      referer: 'https://www.msport.com/ng/',
    },
    { canSettle: false, verified: false },
  ),
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
  // Betwinner NG (1xBet family). Added 2026-10-14 from browser captures -- NOT yet tested live.
  // Decode + create (create only for slips that came from a Betwinner decode, e.g. the Splitter).
  // Not a Converter target: that needs a Betwinner line/feed lookup we don't have yet.
  {
    slug: 'betwinner',
    label: 'Betwinner',
    decode: decodeBetwinnerCode,
    encode: encodeBetwinnerSlip,
    canSettle: false,
    verified: false,
  },
  // Afropari: same engine as Betwinner. Its capture had NO decode/create request, so both are
  // assumed to match Betwinner's -- UNCONFIRMED, added so it can be tested. Same limits as Betwinner.
  {
    slug: 'afropari',
    label: 'Afropari',
    decode: decodeAfropariCode,
    encode: encodeAfropariSlip,
    canSettle: false,
    verified: false,
  },
  // 22bet NG: same engine again (partner 151). Decode only, assumed from Betwinner's -- UNCONFIRMED.
  // Its capture has a create call, but for live games only and on a different path, so no create yet.
  { slug: '22bet', label: '22bet', decode: decode22betCode, canSettle: false, verified: false },
  // Helabet NG: same engine as Betwinner (lib/services/helabet.ts). Decode + create from a real capture
  // (live basketball slip), NOT run live. Create only for slips decoded from Helabet.
  { slug: 'helabet', label: 'Helabet', decode: decodeHelabetCode, encode: encodeHelabetSlip, canSettle: false, verified: false },
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
