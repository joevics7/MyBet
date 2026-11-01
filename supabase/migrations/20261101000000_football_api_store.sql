-- Standalone API-Football store (2026-11-01).
-- Only two scheduled jobs call API-Football (see lib/footballApi/jobs.ts). Everything else reads these tables.
--
--  football_day_fixtures : the day's whole match list (1 request), refreshed with scores by the score job.
--  football_api_usage    : requests spent per UTC day; the jobs refuse to go past the cap (88, under your 90 limit).
--  Team last-10 form for the chosen games goes in the existing team_form_topup table (provider 'apifootball').

create table if not exists football_day_fixtures (
  day date primary key,
  fixtures jsonb not null,
  match_count integer not null default 0,
  fetched_at timestamptz not null default now()
);
alter table football_day_fixtures enable row level security;

create table if not exists football_api_usage (
  day date primary key,
  used integer not null default 0,
  updated_at timestamptz not null default now()
);
alter table football_api_usage enable row level security;
