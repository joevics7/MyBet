-- Last results for teams whose recent form is missing from football_results_by_day (a thin league, an international break).
-- One API-Football request per team, fetched a few at a time by /api/cron/form-topup and kept for a few days.
-- Stored as [{goalsFor, goalsAgainst, isHome}], most recent first. Server-only (service role), like football_results_by_day.
create table if not exists team_form_topup (
  team_id bigint primary key,
  results jsonb not null,
  fetched_at timestamptz not null default now()
);

alter table team_form_topup enable row level security;
-- No policies on purpose: only the service-role client reads and writes this table.
