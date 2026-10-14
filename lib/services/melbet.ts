// Melbet adapter. Same 1xBet-family engine as Betwinner/Helabet, so it reuses
// lib/services/xbetFamily.ts untouched and only supplies its own site config.
//
// From a 2026-10-14 capture of melbet.com (country 132 = Nigeria, currency 115):
//   decode : POST /service-api/LiveBet/Open/GetCoupon   { Guid, Lng: "en", partner: 8 }
//   create : POST /service-api/LiveBet/Open/SaveCoupon  (same body as Betwinner/Helabet)
//   refresh: POST /service-api/LiveBet-update/Open/UpdateCoupon  { ..., Group: 62, Country: 132, Currency: 115 }
//
// Limits:
//  - The capture has the GetCoupon REQUEST but no response body. Decode assumes the response matches
//    Betwinner's and Helabet's (confirmed there, same engine). UNCONFIRMED for Melbet.
//  - The captured slip was live games (Kind 1): a football 1X2 pick (type 3) and a basketball pick
//    (type 402). Pre-match create (xbetFamily sends Kind 3) is unconfirmed.
//  - The capture was on melbet.com. If Nigerian users use melbet.ng, the origin may need changing.
//  - Every request carries an `x-hd` fingerprint token that we do not send or fake
//    (see docs/PLATFORM_STATUS.md, "Bot protection"). Server requests may be rejected.
//  - Create only works for picks decoded from Melbet (its own GameId + price). Not a Converter target.

import { decodeXbetCode, encodeXbetSlip, type XbetConfig } from './xbetFamily';
import type { EncodeSelectionInput } from './sportybet';

export const MELBET_CONFIG: XbetConfig = {
  name: 'melbet',
  origin: 'https://melbet.com',
  referer: 'https://melbet.com/en',
  partner: 8,
  group: 62,
  country: 132,
  currency: 115,
};

export const decodeMelbetCode = (code: string) => decodeXbetCode(MELBET_CONFIG, code);
export const encodeMelbetSlip = (sels: EncodeSelectionInput[]) => encodeXbetSlip(MELBET_CONFIG, sels);
