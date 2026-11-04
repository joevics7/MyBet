-- The day's analysed games, one row per game with its best suggested bet. Powers the "all games" page (pick several,
-- create a booking code) and the 3-day history: result is marked won / lost / void from the saved scores.
create table if not exists predictor_games (
  id uuid primary key default gen_random_uuid(),
  game_date date not null,
  game_key text not null,                 -- provider:matchId, same key the tickets use
  external_event_id text not null,        -- sr:match:N, needed to build booking codes
  home_team text not null,
  away_team text not null,
  competition text,
  kickoff_at timestamptz,
  market text not null,                   -- label, e.g. "Over 2.5 Goals"
  selector jsonb not null,                -- MarketSelector, used to find the bet on a platform and to settle it
  confidence numeric(5,2) not null,       -- 0-100 from the Confidence Engine
  probability numeric(5,4),
  odds numeric(8,2),                      -- SportyBet price at analysis time
  model_source text,                      -- which data priced it: footballdata / apifootball / api-football-predictions
  result text not null default 'pending' check (result in ('pending','won','lost','void')),
  final_score text,
  settled_at timestamptz,
  created_at timestamptz not null default now(),
  unique (game_date, game_key)
);
create index if not exists predictor_games_date_idx on predictor_games (game_date, confidence desc);
alter table predictor_games enable row level security;
create policy "predictor games are publicly readable" on predictor_games for select using (true);
