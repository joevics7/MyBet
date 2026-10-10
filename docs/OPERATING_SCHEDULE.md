# Operating schedule

How each data-heavy tool is meant to run. Keep this in sync with the code
notes at the top of each file listed below.

| Tool | How often | Triggered by | Stored where | Status |
|---|---|---|---|---|
| Daily AI Predictor | once a day | cron-job.org | `predictor_tickets` | Built |
| Odds Comparison | 3 times a day | cron-job.org | snapshot table (to build) | Not built: currently on demand |
| Confidence Score (tipster part) | tipster sites fetched once a day | Vercel Cron `/api/cron/tipster-refresh` (04:00 UTC) | `tipster_predictions` | Built for Statarea + PredictZ; Forebet has no parser yet |

## Daily AI Predictor (`app/api/cron/predictor/route.ts`)
- Runs once a day from **cron-job.org**: `GET /api/cron/predictor` with header
  `Authorization: Bearer <CRON_SECRET>`. `CRON_SECRET` must be set in Vercel;
  without it the route refuses to run in production.
- Game details are fetched once per run (the day's games and odds from the
  SportyBet feed, team form from API-Football). Predictions and tickets are
  calculated from that one fetch and stored. Visitors only read stored tickets.
- cron-job.org gives up after about 30 seconds, so the route answers `202`
  straight away and finishes in the background. Add `?wait=1` to run it in the
  foreground and get the full report (use for manual testing).
- Two sets are published each day (two tabs on the page): **Bookmaker odds**
  (SportyBet's games with real prices) and **Model odds** (wider fixture list,
  model-implied odds). Up to five tickets per set, one per odds band.
- Booking codes are created after the tickets are saved (SportyBet, Football.com,
  MSport and Betway, only where every pick of the ticket exists on that platform)
  and stored on the ticket in `booking_codes`.
- Vercel Cron is not used (`vercel.json` has no crons), so it cannot double-run.

## Odds Comparison (`app/api/odds/day/route.ts`, `lib/odds/day.ts`)
- Target: refreshed 3 times a day by a scheduled job, stored, read by visitors.
- Today: built on demand with a shared 5-minute cache. Moving to the target
  needs a snapshot table and a job route that calls `buildDay()`.

## Confidence Score (`lib/services/tipsterConsensus.ts`, `lib/services/tipsterCache.ts`)
- Statarea and PredictZ are fetched once a day by `/api/cron/tipster-refresh`
  (Vercel Cron, 04:00 UTC, rolling 3-day window) and stored in
  `tipster_predictions`. Decodes read the stored rows and never fetch the sites.
- Forebet: `forebet.ts` is a raw fetch only. No parser until real fetched
  content has been inspected.
- The BetMeter Score (our own model) is separate and uses API-Football team
  form, cached for 6 hours.
