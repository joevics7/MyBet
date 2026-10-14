// Helabet NG adapter. Same 1xBet-family engine as Betwinner/Afropari, so it reuses
// lib/services/xbetFamily.ts untouched and only supplies its own site config.
//
// From a 2026-10-14 capture of helabet.ng (real decode, create and price-refresh calls):
//   decode : POST /service-api/LiveBet/Open/GetCoupon   { Guid, Lng: "en", partner: 237 }
//   create : POST /service-api/LiveBet/Open/SaveCoupon  -> { Success, Value: "<code>" }
//   refresh: POST /service-api/LiveBet-update/Open/UpdateCoupon  { ..., Group: 768, Country: 132, Currency: 115 }
// Response and event fields are identical to Betwinner's.
//
// Limits:
//  - The capture's slip was two LIVE basketball games (Kind 1, market group 101 "Team Wins"), so the
//    pre-match create body is unconfirmed (xbetFamily sends Kind 3, from Betwinner's capture).
//  - Every request in the capture carries an `x-hd` fingerprint token that we do not send or fake
//    (see docs/PLATFORM_STATUS.md, "Bot protection"). Server requests may be rejected.
//  - Create only works for picks that came from a Helabet decode (Helabet's own GameId + price).
//  - Not a Converter target: that needs a Helabet line feed, which is not in the research.

import { decodeXbetCode, encodeXbetSlip, type XbetConfig } from './xbetFamily';
import type { EncodeSelectionInput } from './sportybet';

export const HELABET_CONFIG: XbetConfig = {
  name: 'helabet',
  origin: 'https://helabet.ng',
  referer: 'https://helabet.ng/en',
  partner: 237,
  group: 768,
  country: 132,
  currency: 115,
};

export const decodeHelabetCode = (code: string) => decodeXbetCode(HELABET_CONFIG, code);
export const encodeHelabetSlip = (sels: EncodeSelectionInput[]) => encodeXbetSlip(HELABET_CONFIG, sels);
