# Platform status, limitations and open issues

Last updated 2026-10-21. Keep this in sync with `lib/services/platforms.ts`.
"Tested" means tried against the real site from our server. "Captured" means built from a
browser capture and not yet run live.

**Live test results, 2026-10-21 (from the owner).** Decode works on SportyBet, Football.com, MSport, Betway, Betwinner,
Helabet, Paripesa and Melbet. Only SportyBet and Football.com work end to end (decode, Converter, Splitter, Vault). Decode
does NOT work on Betpawa, 1xBet, 22bet and Bet9ja. Afropari was a stub on that date and is now built (below, not yet run live).
The four xBet-engine sites decode without the `x-hd` token, so the bot-protection worry below did not stop decode there.

## At a glance

| Platform | Decode | Create code | Result check (Vault) | Converter source | Converter target | State |
|---|---|---|---|---|---|---|
| SportyBet | yes | yes | yes | yes | yes | Tested, works |
| Football.com | yes (fixed 2026-10-14) | yes | yes | yes | yes | Decode fixed against a real capture, not yet run live |
| Betway | yes | yes | no | yes | yes | Tested 2026-10-10, works |
| Bangbet | yes | yes (untested) | no | yes | no | Decode tested; rebuilt 2026-10-14 from captures, needs a retest |
| 1xBet | yes (captured) | no | no | yes | no | Own file, decode only (capture has no create call). Not run live |
| Paripesa | assumed response | yes (captured) | no | yes | no | Own file; create captured (code 238NQ), decode response not in the file. Not run live |
| Betwinner | yes (captured) | yes (captured) | no | yes | no | Own file, fully captured (decode response + create, pre-match). Not run live |
| Helabet | yes (captured) | yes (captured) | no | yes | no | Own file; captured on live basketball picks. Not run live |
| Melbet | assumed response | yes (captured) | no | yes | no | Own file; decode response not in the capture. Not run live |
| Afropari | yes (captured) | yes (single pick captured) | no | no | no | Own file, built 2026-10-21 from a capture with GetCoupon, UpdateCoupon and SaveCoupon. Not run live |
| 22bet | no | built, unreachable | no | no | no | Decode not implemented (no capture). Create built from capture but needs 22bet match ids |
| Betpawa | not mapped | captured | no | yes (once decode works) | no | Request built; response is protobuf with unknown layout. Create code from a Betpawa decode only |
| MSport | yes (rebuilt 2026-10-14) | yes | no | yes | yes | Rebuilt from a capture, own adapter; not yet run live (capture was logged in) |
| Stake | no | no | no | no | no | Tested 2026-10-10, does not work |
| Bet9ja | paste-import only | no | no | yes (via paste-import) | no | Server request blocked by Akamai; manual route added 2026-10-14, untested |

## Bot protection (Betwinner, Afropari, 22bet, Helabet, Melbet; probably others)

Update 2026-10-21: decode works on Betwinner, Helabet, Paripesa and Melbet without the token, so the expectation below was too pessimistic for decode; create is still untested on most of them.

**Fingerprint token.** Every Betwinner and Afropari request carries an `x-hd` token minted by a
browser fingerprinting check (a 214 KB encrypted payload posted to `/hd-api/external/verify`).
We do not send it, and we will not try to fake that token, since it exists to block automated
access. Both adapters send plain requests only (no cookies, no `x-hd`).

Expected result: server-side requests may be rejected, the same way Bet9ja is blocked by
Akamai. How to tell: decode returns "invalid" on a real code and the Vercel logs show
`[betwinner ... non-OK]` or `[afropari ... non-OK]`. If that happens, park the platform like
Bet9ja (hide it from the pickers via `PICKER_EXCLUDED` in `lib/telegram/menus.ts`).

## Per platform: what is left and limits

### Bangbet (`lib/services/bangbet.ts`)
- Uses `bookingV2`. Kickoff time is not in the decode response, so it is fetched from
  `getMatchMarketRelateOdds` (this missing kickoff was why confidence scores were blank).
- Unverified: the odds-room-id format (assumed `producer#eventId#marketId#specifiers`); the
  exact market and outcome names Bangbet uses for Over/Under and GG/NG (we map by Sportradar
  ids 18 / 29 first, names second); `betType` for single-pick slips (only `1` seen, with three
  picks).
- Open question: a code decoded as `Mahm9` was created as `Mahm9x`. Confirm whether the trailing
  `x` is part of the code.
- Create code: written from the captured `/bet/share` request, never run live. Kept out of the
  Converter targets until tested. Needs `sr:match:` ids, so only slips from Bangbet or the
  SportyBet family can be re-encoded.
- Not covered: odds comparison feed, Predictor codes, Vault result checking.

### 1xBet (`lib/services/onexbet.ts`)
- Standalone, decode only. From a real capture of 1xbet.ng: GetCoupon request and response (partner 159) on three
  pre-match basketball picks (`Kind` 3), plus UpdateCoupon (group 412, country 132, currency 115). Replayed
  response decodes to the captured total (5.95).
- No create call in the capture, so no encode. Needs a capture of 1xBet's own SaveCoupon before create can be added.
- Opens codes at `https://1xbet.ng/en?coupon-code=<code>` (deep link). Football picks are untested here; basketball
  totals show in the site's own wording and are unscored. Same `x-hd` risk: not sent. Not a Converter target.

### Paripesa (`lib/services/paripesa.ts`)
- The research file is named `parissa.txt`; the site is `paripesa.ng` (partner 188). Standalone file.
- Create is captured for real: SaveCoupon on two pre-match football picks returned code `238NQ`; replayed body is identical.
- Decode: the GetCoupon request is captured, but the file has no GetCoupon response, so decode assumes the Betwinner/Helabet
  response shape (unconfirmed). Group 758 / Country 132 / Currency 115 come from an UpdateCoupon response (its request is
  not in the file), so the price-refresh body is partly inferred.
- The file's first block is unlabelled (a 9-pick sportsbook-format betslip JSON, then an UpdateCoupon response).
  Same `x-hd` risk. Not a Converter target.

### Betwinner (`lib/services/betwinner.ts`)
- Standalone file, nothing shared with other bookmakers (the old shared engine `xbetFamily.ts` was removed 2026-10-14).
- Everything is from a real capture of betwinner.ng: GetCoupon request and response, UpdateCoupon, SaveCoupon, on
  pre-match football picks (`Kind` 3). Our create body is byte-for-byte the captured one when replayed.
- 1X2 is mapped from the site's own `W1`/`X`/`W2` text, and football Totals from its own `Total Over/Under (line)`
  wording (that wording is seen in the 1xbet.ng capture, group 17; football totals themselves are untested).
  Both-to-score is not mapped: no capture shows it, so it stays in the site's wording (unscored). Helabet and
  Melbet use the same rules.
- Each pick keeps its own `Kind` through decode and create (`rawSpecifier` = `p=<Param>;k=<Kind>`).
- Same `x-hd` risk: not sent. Look for `[betwinner ... non-OK]` in logs. Create only for Betwinner-decoded picks; not a Converter target.

### Helabet (`lib/services/helabet.ts`)
- Standalone file. Partner 237, group 768, country 132, currency 115. Decode response, refresh and create from a
  real capture of two LIVE basketball games (`Kind` 1), so pre-match is untested. Replayed create body is identical.
- Football market ids are not mapped beyond 1X2 (see Betwinner). Same `x-hd` risk. Not a Converter target.

### Melbet (`lib/services/melbet.ts`)
- Standalone file. Partner 8, group 62, country 132, currency 115, captured on `melbet.com` (check `melbet.ng`).
- The capture has the decode REQUEST but no decode RESPONSE: decode reads the response like the Betwinner and
  Helabet captures show it, which is unconfirmed here. Refresh sends `IsExpressBoost: true` as the site does.
- Live picks only (`Kind` 1). Replayed create body is identical. Same `x-hd` risk. Not a Converter target.

### Afropari (`lib/services/afropari.ts`)
- Built 2026-10-21 from a 2026-10-20 capture of afropari.com (partner 300) that holds the real decode request AND response
  (`GetCoupon`, code 3MHAE), the price refresh (`UpdateCoupon`) and the create (`SaveCoupon`, returned `3MHAE`). Standalone file.
- Replayed through the code with mocked network calls: decode of the captured response, and a create body identical to the
  captured one (single pick, `Vid 0`). Not run against the live site.
- Captured pick is an outright (no away team, non-zero `PlayerId`), so decode keeps picks without an away team and create
  carries each pick's own `PlayerId` (packed in `rawSpecifier` as `p=<Param>;k=<Kind>;pl=<PlayerId>`).
- NOT captured: a multi-pick create on Afropari. `Vid 1` for more than one pick comes from the Betwinner/Paripesa captures;
  confirm on the first real multi-pick split. Football 1X2 / Totals wording is the engine's, not seen on Afropari itself.
- The refresh `Group` was 806 (2026-10-14) and 2470 (2026-10-20), matching the `x-dt` response header each time, so the adapter
  uses the latest `x-dt` it sees and falls back to 2470. The refresh is best-effort.
- Sends `x-app-n` / `x-svc-source` (`__BETTING_APP__`) as the capture does. Does not send `x-hd` or cookies. If the site rejects
  server requests the log shows `[afropari <path>] non-OK`; a refused create logs the site's own Error/ErrorCode.
- Splitter: creates are queued one at a time inside this file (precaution after a Paripesa split created only its first code).
- Not a Converter target (no Afropari match feed captured). Not in Vault result checking.

### 22bet (`lib/services/twentytwobet.ts`)
- Decode NOT implemented: the capture has no decode request. Reports "unsupported".
- Create is built from the capture: `POST /LiveUtil/SaveCoupon` (not the `/service-api` path others use) with its
  own body (`Live`, `Summ: 1`, `Opp*Images`, object `PlayersDuel`), preceded by UpdateCoupon in 22bet's own shape
  (`NeedUpdateLine`, `UserId`, no Group/Country/Currency). Replayed body is identical to the capture.
- Unreachable for now: a pick needs 22bet's own GameId/Type, which only a 22bet decode or match feed can supply.
  Captured picks were all live (`Kind` 1, `Live: true`); pre-match is untested.

### Betpawa (`lib/services/betpawa.ts`, `lib/services/protobuf.ts`)
- API is same-origin and anonymous, but responses are **protobuf** (`BookingCodeEventPriceListProto`,
  schema `price.proto`, not public). `protobuf.ts` reads the wire format without a schema.
- Create code (`POST /v3/booking-number`, JSON in, `{ code }` out) is confirmed by the capture, not run live.
  A pick is Betpawa's own numeric price id, so it only works for slips decoded from Betpawa.
- Decode request (`GET /v3/booking-number/<code>`) is built, but the capture has no response body, so
  `mapBooking()` is empty: decode returns invalid and logs the response structure
  (`[betpawa decode] unmapped response layout`). Needs one real decode response to map.
- Not sent: cookies and `x-device-fingerprint`. If Cloudflare rejects server requests, look for
  `[betpawa decode non-OK]` in the logs.
- Converter target: needs the events feed (`/v4/events/lists/by-queries`, also protobuf) mapped.
- Hidden from the Telegram pickers until decode works (`PICKER_EXCLUDED`).

### SportyBet family (SportyBet, Football.com, MSport)
- SportyBet is the only platform where the Vault can auto-check results.
- Football.com is a white-label with the same paths and ids but a different decode response. Fixed
  2026-10-14 from a capture: the response has no `isAvailable` and no `ticket` (the decoder used to reject
  it as invalid); picks are the markets left in `data.outcomes`, total odds are multiplied from the picks.
  Requests now send `clientid`/`platform` = `wap` (its own site's values) and no `_t`. Checked against the
  captured response only, not live. Not sent: cookies, `sporty-referer`, empty `operid`; if it still fails
  live, look for `invalid` on a real code and try adding those. Share link is
  `https://www.football.com/ng/?shareCode=<code>`.
- MSport: the 2026-10-10 failure was because it was run through SportyBet's adapter, but MSport's
  response shape (`data.bettableBetSlip[]`), create body (numeric `marketId`, `specifier: ""`) and
  headers (`apilevel`, `channel`, `operid`, `deviceid`, `WEB`) all differ. Rebuilt 2026-10-14 in
  `lib/services/msport.ts` from a capture. Not yet run live: the capture was a logged-in session and we
  send no cookies, so anonymous access is untested. Expired codes return `bizCode 19000`. Result
  checking is off (the capture's slip had not started). Back in the Telegram pickers and Converter
  targets; still not in Predictor codes. If it fails live, check Vercel logs for `[msport ... non-OK]`.

### Betway
- Decode and create work. Result checking is off (the decode does not report per-pick results).
- Converting to Betway does not support BTTS picks. Two picks from the same game cannot share a
  Betway slip.

### Stake
- Decode takes a share link or bet ID, not a booking code, and does not work (tested 2026-10-10).

### Bet9ja (`lib/services/bet9ja.ts`)
- Server-side decode (`GetBookABetCouponV2`) gets a 403 from Akamai at the edge (confirmed
  2026-09-29, most likely IP reputation of Vercel's servers). We do not work around Akamai Bot
  Manager: no residential proxies, headless browsers or forged sensor cookies.
- Added 2026-10-14: **paste-import**. The Decoder shows a link to the coupon URL for the user to
  open in their own browser; pasting the JSON it shows (text starting with `{`) is parsed by the
  same code, no network call. Works on the website only (not in the Telegram bot). Untested live.
  Unknown: whether that URL opens cleanly in a plain browser tab.
- Fixed: Bet9ja draws were never scored (sign "X" was not recognised as a draw). Market text is now
  built from the pick id (`S_1X2_1/X/2`, confirmed by the capture). Total goals (`S_OU@2.5_O`) and
  GG/NG are built from earlier research / market names and are unverified.
- Create code (not built): `POST apigw.bet9ja.com/sportsbook/placebet/BookABetV2`, form field
  `BETSLIP` (JSON), the new code comes back as `data[0].RIS`. Needs Bet9ja's own event ids and pick
  ids, which no other platform has, so converting TO Bet9ja needs a Bet9ja odds-feed capture. It
  sits behind the same protection, so it will probably be blocked too.
- Result checking: the coupon response has no per-pick results.
- Pasted responses are not saved to the Vault (a code is needed), and the Telegram bot cannot take
  them.

## Cross-cutting issues

1. **Confidence coverage.** Scores need a kickoff time and the match to exist in API-Football or
   football-data.org. Lower leagues and some international matches are not covered, so those
   picks show no score. That is a data gap, not a bug.
2. **"2UP" markets are scored as plain wins.** `parseMarketString` reads "1X2 - 2UP - Home" (and
   Bangbet's "1x2 (2up)", market 1601) as an ordinary home win. A 2UP pick pays out earlier, so
   its true chance is higher than the score shown. Known, not fixed.
3. **Only 1X2, Over/Under and BTTS are scored or converted.** Everything else is shown unscored.
4. **Vault** dropdown (`components/tools/VaultManager.tsx`) only lists SportyBet and Bet9ja, and
   only SportyBet can be auto-checked.
5. **Odds comparison** (`lib/odds/day.ts`) and **Predictor codes** (`lib/predictor/codes.ts`) have
   no Bangbet, Betwinner or Afropari support.
6. **Converter targets** are SportyBet, Football.com and Betway only (`CONVERT_TARGETS` in
   `lib/platformList.ts`). A new target needs both a create-code call and a resolver that finds
   the match on that platform.
7. **Testing.** There is no automated test suite. The 2026-10-14 changes were checked with
   scratch scripts using mocked network calls, and the project has not been type-checked or
   built since. Run `npm run build` before relying on a deploy.
8. **Captures contain personal data.** Raw browser captures include session cookies and
   affiliate tags. Do not commit them or paste them in public places.

## Open issues from the 2026-10-14 platform work (Betpawa, Football.com, Helabet, Melbet, MSport)

Nothing below has been run against the real sites. The sandbox these were built in cannot reach the
bookmakers, so every adapter was checked only by replaying the captured responses through the code
and by `tsc`. `next build` could not be run there either (it fails fetching Google Fonts), so run
`npm run build` before relying on a deploy.

**All five**
- A capture is one person's browser session. Sites may treat server requests differently: IP
  reputation, Cloudflare/CloudFront bot rules, and headers or cookies we deliberately do not send
  (`x-hd`, `x-device-fingerprint`, cookies). If decode returns "invalid" on a real code, check the
  logs for `[<platform> ... non-OK]` first.
- Re-run `supabase/seeds/platforms.sql` for the new rows (betpawa, helabet, melbet). The Supabase
  project connected to Claude does not contain BetMeter's tables, so they were not checked there.

**Betpawa** (not working: decode)
- Decode cannot work yet: responses are protobuf with a private schema, and the capture has no decode
  response body. `mapBooking()` is empty on purpose rather than guessing fields. Needs one real response.
- Create code (JSON, from the capture) is untested, and it is unknown whether multiples use a `type`
  other than `SINGLE`.
- Not a Converter target: the match feed is protobuf and unmapped. Hidden from Telegram pickers.

**Football.com**
- Decode fixed against a capture only. Cookies, `sporty-referer` and `operid` are not sent; CloudFront
  may reject server traffic.
- Vault checking is switched on but untested: the capture's slip had not started, so it is unknown
  whether per-pick results (`isWinning`) are reported. If not, the Vault cannot settle these slips.
- The odds feed (`pcUpcomingEvents`, used by Odds comparison) is a guessed copy of SportyBet's path
  and sends none of the `wap` headers. It may fail silently. Not in the capture.
- Unused: its own converter endpoint (`/orders/converter/code`) and live-odds endpoint
  (`/factsCenter/Outcomes`).

**Helabet**
- Same `x-hd` risk as Betwinner. The capture was two live basketball games, so pre-match create
  (`Kind`) is unconfirmed, and basketball picks are unscored.
- Football market ids (totals, GG/NG) are 1xBet-family assumptions, not confirmed on this site.
- Not a Converter target (no match feed).

**Melbet**
- The capture has the decode request but no decode response, so decode assumes Betwinner's shape.
- Captured on `melbet.com`; Nigerian users may be on `melbet.ng`.
- One pick in the capture was `Block: true` (a live game); create refuses blocked picks by design.
- The site sends `IsExpressBoost: true` on price refresh; we do not. Effect unknown.
- Same `x-hd` risk; live-only capture, so pre-match create is unconfirmed; not a Converter target.

**MSport**
- The capture was a logged-in session. We send no cookies, so anonymous access is unproven; if MSport
  requires login for share lookups it will still fail.
- Vault checking off (slip had not started). Not in Predictor codes.
- Added back to the Converter targets and Telegram pickers without a live test. If it misbehaves,
  remove it from `CONVERT_TARGETS` (`lib/platformList.ts`) and add `msport` back to `PICKER_EXCLUDED`
  (`lib/telegram/menus.ts`).
