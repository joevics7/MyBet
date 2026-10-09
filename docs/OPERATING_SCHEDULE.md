# Operating schedule

How each data-heavy tool is meant to run. Keep this in sync with the code
notes at the top of each file listed below.

| Tool | How often | Triggered by | Stored where | Status |
|---|---|---|---|---|
| Daily AI Predictor | once a day | cron-job.org | `predictor_tickets` | Built |
| Odds Comparison | 3 times a day | cron-job.org | snapshot table (to build) | Not built: currently on demand |
| Confidence Score (tipster part) | tipster sites fetched once a day | cron-job.org | tipster table (to build) | Not built: currently live per decode |

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
- Vercel Cron is not used (`vercel.json` has no crons), so it cannot double-run.

## Odds Comparison (`app/api/odds/day/route.ts`, `lib/odds/day.ts`)
- Target: refreshed 3 times a day by a scheduled job, stored, read by visitors.
- Today: built on demand with a shared 5-minute cache. Moving to the target
  needs a snapshot table and a job route that calls `buildDay()`.

## Confidence Score (`lib/services/tipsterConsensus.ts`)
- Target: Statarea, PredictZ and Forebet are fetched once a day and stored;
  scores are calculated from the stored data, never by fetching during a decode.
- Today: Forebet is not built, and Statarea/PredictZ are fetched live on every
  decode (PredictZ via ZenRows credits).
- The BetMeter Score (our own model) is separate and uses API-Football team
  form, cached for 6 hours.
