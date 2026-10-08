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
import { decodeBangbetCode } from './bangbet';
import { decodeStakeBet } from './stake';
import { decodeBetwayCode, encodeBetwaySlip } from './betway';

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
  // SportyBet white-label: same stack, same IDs, same response shape.
  shareFamily(
    'footballcom',
    'Football.com',
    {
      baseUrl: 'https://www.football.com/api/ng/orders/share',
      origin: 'https://www.football.com',
      referer: 'https://www.football.com/ng/',
    },
    { canSettle: true, verified: false, deepLink: 'https://www.football.com/ng/m?shareCode={code}' },
  ),
  // Same Sportradar-style IDs; path differs. Response shape assumed to match
  // SportyBet's -- unconfirmed, so settlement checking stays off until verified.
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
  {
    slug: 'bangbet',
    label: 'Bangbet',
    decode: decodeBangbetCode,
    canSettle: false,
    verified: false,
    deepLink: 'https://www.bangbet.com/static/share/book.html?{code}',
  },
  // Anonymous JSON API documented from live tests in a public repo (not yet
  // run from our server). Decode + create. Result checking stays off.
  {
    slug: 'betway',
    label: 'Betway',
    decode: decodeBetwayCode,
    encode: encodeBetwaySlip,
    canSettle: false,
    verified: false,
  },
  // Decode only. Input is a share link or bet ID ("sport:12345678"), not a
  // booking code. No create path exists. Lookup query unverified.
  { slug: 'stake', label: 'Stake', decode: decodeStakeBet, canSettle: false, verified: false },
  // Decode-only; known to fail from our server (geo/bot protection). Parked.
  { slug: 'bet9ja', label: 'Bet9ja', decode: decodeBet9jaCode, canSettle: false, verified: false },
];

export function getPlatform(slug: string | undefined | null): PlatformAdapter | undefined {
  return PLATFORMS.find((p) => p.slug === slug?.trim().toLowerCase());
}

export function deepLinkFor(slug: string, code: string): string | null {
  const p = getPlatform(slug);
  return p?.deepLink ? p.deepLink.replace('{code}', encodeURIComponent(code)) : null;
}
