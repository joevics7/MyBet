-- The Odds Comparison page reads these rows; a scheduled job (/api/cron/odds,
-- called 3x a day by cron-job.org) rewrites them. One row per UTC kickoff date
-- so a visitor's request only reads the 1-2 days it needs.
create table odds_snapshots (
  day date primary key,
  matches jsonb not null,
  match_count int not null default 0,
  sources jsonb not null default '[]'::jsonb,
  generated_at timestamptz not null default now()
);

-- Server-only: read and written with the service-role key. RLS on with no
-- policies means the public (anon) key cannot read or write it.
alter table odds_snapshots enable row level security;
