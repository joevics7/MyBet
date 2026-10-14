// Afropari adapter -- DECODE AND CREATE ARE NOT IMPLEMENTED, because the research does not contain them.
//
// What the 2026-10-14 capture of afropari.com actually holds:
//  - the booking-code lookup page loading a captcha script (/captcha-api/api/v4/<id>.js) and calling
//    POST /hd-api/external/verify, which answers a short-lived { token, extra_ctoken, expiresAt }.
//    The lookup is behind that browser challenge; we do not try to pass or fake it.
//  - two price-refresh calls: POST /service-api/LiveBet-update/Open/UpdateCoupon with
//    { Lng, CfView, Vid, Events, NeedUpdateLine: false, partner: 300, Group: 806, IsNeedUpdatePromoCode: true }
//    on pre-match football picks (Kind 3, Type 3), plus a feed call and event.json calls.
//  - NO GetCoupon (decode) request and NO SaveCoupon (create) request.
//
// Until a capture of the real decode request AND response (and the create call) exists, this adapter
// reports "unsupported" instead of guessing at another site's endpoints.

import type { DecodeResult } from './types';

export async function decodeAfropariCode(_code: string): Promise<DecodeResult> {
  console.error('[afropari decode] not implemented: no decode request in the research (behind a captcha/fingerprint check)');
  return { status: 'unsupported_platform', shareCode: null, selections: [], totalOdds: null, raw: null };
}
