-- Daily AI Predictor storage. One row per generated ticket per day per
-- target odds band (1.5/2/3/4/5), with its selections.

create table predictor_tickets (
  id uuid primary key default gen_random_uuid(),
  ticket_date date not null,
  target_band numeric(4,2) not null,   -- 1.5, 2, 3, 4, or 5
  combined_odds numeric(10,2) not null, -- model-implied odds (see note below), not a bookmaker's
  avg_confidence numeric(5,2) not null,
  created_at timestamptz not null default now(),
  unique (ticket_date, target_band)
);

create table predictor_ticket_selections (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references predictor_tickets(id) on delete cascade,
  external_event_id text not null,  -- football-data.org match id
  home_team text not null,
  away_team text not null,
  competition text,
  market text not null,
  score numeric(5,2) not null,
  model_odds numeric(10,2) not null, -- 1/probability -- see note in predictorSelection.ts
  reason text,
  kickoff_at timestamptz
);

create index idx_predictor_tickets_date on predictor_tickets(ticket_date);
create index idx_predictor_selections_ticket on predictor_ticket_selections(ticket_id);

alter table predictor_tickets enable row level security;
alter table predictor_ticket_selections enable row level security;

create policy "predictor tickets are publicly readable" on predictor_tickets for select using (true);
create policy "predictor selections are publicly readable" on predictor_ticket_selections for select using (true);
