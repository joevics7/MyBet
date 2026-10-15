-- One row per past day: every finished match that API-Football listed for that date (all leagues), stored
-- compactly as [homeTeamId, awayTeamId, homeGoals, awayGoals]. Team "recent form" is built from these rows,
-- so scanning a game costs no API request. A past day never changes, so each day is fetched once.
-- Written by the server only (service role); nothing here needs to be readable from the browser.
create table if not exists football_results_by_day (
  day date primary key,
  results jsonb not null,
  match_count integer not null default 0,
  fetched_at timestamptz not null default now()
);

alter table football_results_by_day enable row level security;
-- No policies on purpose: only the service-role client (cron + server code) reads and writes this table.
