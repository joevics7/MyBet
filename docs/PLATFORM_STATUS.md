# Platform status, limitations and open issues

Last updated 2026-10-14. Keep this in sync with `lib/services/platforms.ts`.
"Tested" means tried against the real site from our server. "Captured" means built from a
browser capture and not yet run live.

## At a glance

| Platform | Decode | Create code | Result check (Vault) | Converter source | Converter target | State |
|---|---|---|---|---|---|---|
| SportyBet | yes | yes | yes | yes | yes | Tested, works |
| Football.com | yes | yes | yes | yes | yes | Same stack as SportyBet, not separately verified |
| Betway | yes | yes | no | yes | yes | Tested 2026-10-10, works |
| Bangbet | yes | yes (untested) | no | yes | no | Decode tested; rebuilt 2026-10-14 from captures, needs a retest |
| Betwinner | captured | captured | no | yes | no | Not yet run live |
| Afropari | guessed | guessed | no | yes | no | Not yet run live; no decode/create capture exists |
| 22bet | guessed | no | no | yes | no | Not yet run live; no decode capture, create captured for live games only |
| MSport | no | no | no | no | no | Tested 2026-10-10, decode does not work |
| Stake | no | no | no | no | no | Tested 2026-10-10, does not work |
| Bet9ja | paste-import only | no | no | yes (via paste-import) | no | Server request blocked by Akamai; manual route added 2026-10-14, untested |

## Bot protection (applies to Betwinner and Afropari, probably others)

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

### Betwinner (`lib/services/xbetFamily.ts`)
- Decode (`GetCoupon`), price refresh (`UpdateCoupon`) and create (`SaveCoupon`) come from a real
  capture, not run live. See the bot-protection note above.
- Confirmed by the capture: 1X2 (group 1, types 1/2/3). Assumed from the 1xBet family, unverified:
  Total goals (group 17, types 9/10 with the line in `Param`), Both teams to score (group 19,
  types 180/181). Every other market (handicap etc.) is shown with Betwinner's own text and left
  unscored.
- Create code works only for picks that came from a Betwinner decode (needs Betwinner's own
  numeric game id and a price). The Splitter can use it; the Converter cannot target it.
- Copied from the capture without proof: `Kind: 3`, `Summ: 1000` (stake placeholder), and
  `Vid` 0 for one pick / 1 for several.
- To make it a Converter target we need a request that lists matches with odds (a line feed).
  Not in the research yet. The same gap blocks odds comparison and Predictor codes.

### Afropari (`lib/services/xbetFamily.ts`)
- Same engine as Betwinner (partner 300, group 806, country 132 from the captured feed URL).
- The capture had no decode or create request (the "decoding booking code" section captured a
  captcha script). Both calls are assumed to match Betwinner's. Unconfirmed, and a guess may
  simply be wrong.
- The only feed captured, `topGamesByStat`, lists the top 10 games, which is not enough to find a
  given match for the Converter.
- Currency id was not visible in the capture, so it is omitted from `UpdateCoupon`.
- Needs: the real decode request, the real create request, and a full line feed.

### 22bet (`lib/services/xbetFamily.ts`)
- Same engine as Betwinner and Afropari (partner 151). Same `x-hd` fingerprint token, so the
  bot-protection note above applies.
- The capture has `UpdateCoupon` and a create call, but no decode request. Decode is assumed to
  match Betwinner's (`GetCoupon`). Unconfirmed.
- Create is known but not built: `POST https://22bet.ng/LiveUtil/SaveCoupon` (a different path from
  Betwinner's), body `{ Live, Summ, Lng, Vid, CfView, notWait, partner, Events: [...] }`, code returned
  in `Value`. It was captured with LIVE games only (`Kind: 1`, `Live: true`); the pre-match body is
  not known. Note: this suggests Kind 1 = live and Kind 3 = pre-match, which also means the Betwinner
  create (which sends `Kind: 3`) would be wrong for live games.
- Needs: the real decode request, a pre-match create request, a full line feed.

### SportyBet family (SportyBet, Football.com, MSport)
- SportyBet is the only platform where the Vault can auto-check results.
- Football.com is a white-label with the same API; it has not been verified on its own.
- MSport decode does not work (tested 2026-10-10); it is hidden from the Telegram pickers and
  left out of Converter targets and Predictor codes.

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
