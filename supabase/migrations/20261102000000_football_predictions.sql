-- The day's best 40 games (chosen from tipster coverage + SportyBet's list) and API-Football's own prediction for each.
-- Rows are created by the daily job with data = null, then filled a few at a time by /api/cron/football-predictions
-- (the free plan allows only ~10 requests a minute). Nothing outside lib/footballApi writes here.
create table if not exists football_predictions (
  fixture_id bigint primary key,           -- API-Football fixture id
  day date not null,
  rank integer not null,                   -- 1 = best candidate
  home_team_id bigint not null,
  home_name text not null,
  away_team_id bigint not null,
  away_name text not null,
  kickoff timestamptz,
  data jsonb,                              -- the raw /predictions reply (null until fetched)
  fetched_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists football_predictions_day_idx on football_predictions (day, rank);
alter table football_predictions enable row level security;
