-- Cache for scraped tipster predictions (Statarea, Predictz, eventually
-- Forebet). Populated by a daily cron (/api/cron/tipster-refresh), read
-- by the Decoder/Splitter/Predictor instead of live-fetching on every
-- request -- this is the real fix for burning ZenRows/Statarea requests
-- on every single decode call.
--
-- Nullable fields throughout: different sources publish different data
-- (Statarea gives 1X2/O-U/BTTS percentages; Predictz gives a predicted
-- score + 1X2 odds, no O-U/BTTS at all) -- one wide table, not a table
-- per source, since callers query across sources uniformly by date.

create table tipster_predictions (
  id uuid primary key default gen_random_uuid(),
  source text not null check (source in ('statarea', 'predictz', 'forebet')),
  match_date date not null,
  home_team text not null,
  away_team text not null,

  home_win_pct numeric(5,2),
  draw_pct numeric(5,2),
  away_win_pct numeric(5,2),
  over_15_pct numeric(5,2),
  over_25_pct numeric(5,2),
  over_35_pct numeric(5,2),
  btts_yes_pct numeric(5,2),
  btts_no_pct numeric(5,2),

  predicted_home_score int,
  predicted_away_score int,
  odds_home numeric(6,2),
  odds_draw numeric(6,2),
  odds_away numeric(6,2),

  fetched_at timestamptz not null default now()
);

create index idx_tipster_predictions_lookup on tipster_predictions(source, match_date);

alter table tipster_predictions enable row level security;

create policy "tipster predictions are publicly readable" on tipster_predictions for select using (true);
-- No public insert/update/delete policy -- only the service-role client
-- (the cron) writes here, same pattern as platforms/fixtures/etc.
