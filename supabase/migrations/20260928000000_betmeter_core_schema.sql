-- BetMeter core schema.
-- Implements the 5 shared backend services from the product spec:
-- Decode, Encode (via platforms + decodes), Confidence Engine, Odds Lookup,
-- Fixture/Results Feed — plus the Vault and per-user settings that sit on top.

create table platforms (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,              -- 'sportybet', 'bet9ja', '1xbet', 'betking'
  name text not null,
  is_supported_decode boolean not null default false,
  is_supported_encode boolean not null default false,
  code_format_regex text,                 -- used for auto-detecting platform from a pasted code
  deep_link_template text,                -- '{code}' placeholder, e.g. https://sportybet.com/ng/booking/{code}
  affiliate_base_url text,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

-- One row per decode attempt (a pasted booking code resolved once).
create table decodes (
  id uuid primary key default gen_random_uuid(),
  platform_id uuid references platforms(id) on delete set null,
  source_code text not null,
  status text not null check (status in ('ok','invalid','expired','unsupported_platform')),
  raw_response jsonb,
  created_at timestamptz not null default now()
);

create table decoded_selections (
  id uuid primary key default gen_random_uuid(),
  decode_id uuid not null references decodes(id) on delete cascade,
  platform_id uuid references platforms(id) on delete set null,
  external_event_id text,                 -- platform's own game/event id, for matching across services
  home_team text not null,
  away_team text not null,
  market text not null,
  odds numeric(10,2) not null,
  kickoff_at timestamptz,
  is_locked boolean not null default false,
  match_status text,                      -- platform's own status string, e.g. 'Ended', 'Not started'
  is_winning boolean,                     -- null until the platform reports a result for this leg
  created_at timestamptz not null default now()
);

-- Confidence Engine output. Platform-agnostic, keyed by event+market.
-- Cache window: 24h (enforced in application logic via expires_at).
create table confidence_scores (
  id uuid primary key default gen_random_uuid(),
  platform_id uuid references platforms(id) on delete set null,
  external_event_id text not null,
  market text not null,
  score numeric(5,2) not null check (score >= 0 and score <= 100),
  reason text,
  computed_at timestamptz not null default now(),
  expires_at timestamptz not null,
  unique (platform_id, external_event_id, market)
);

-- Odds Lookup Service output. On-demand only, short cache (5-10 min).
create table odds_quotes (
  id uuid primary key default gen_random_uuid(),
  platform_id uuid not null references platforms(id) on delete cascade,
  external_event_id text not null,
  market text not null,
  odds numeric(10,2) not null,
  fetched_at timestamptz not null default now(),
  expires_at timestamptz not null
);

-- Fixture/Results Feed — daily ingestion, used by the Vault auto-checker
-- and the bonus Predictor.
create table fixtures (
  id uuid primary key default gen_random_uuid(),
  external_event_id text unique not null,
  home_team text not null,
  away_team text not null,
  competition text,
  kickoff_at timestamptz not null,
  status text not null default 'scheduled'
    check (status in ('scheduled','live','finished','postponed','abandoned')),
  home_score int,
  away_score int,
  updated_at timestamptz not null default now()
);

-- Tool 5: Bet Code Vault + Auto Result Checker.
create table vault_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  platform_id uuid references platforms(id) on delete set null,
  code text not null,
  decode_id uuid references decodes(id) on delete set null,
  status text not null default 'pending'
    check (status in ('pending','won','lost','void','unable_to_check')),
  saved_at timestamptz not null default now(),
  settled_at timestamptz,
  legs_total int not null default 0,
  legs_correct int,
  unique (user_id, platform_id, code)     -- dedupe: same code saved twice by the same user
);

-- Tool 6 inputs + Telegram linkage.
create table user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  telegram_chat_id text unique,
  bankroll numeric(12,2),
  kelly_fraction numeric(3,2) not null default 0.25,   -- quarter Kelly default
  notifications_muted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_decoded_selections_decode on decoded_selections(decode_id);
create index idx_decoded_selections_event on decoded_selections(platform_id, external_event_id);
create index idx_confidence_lookup on confidence_scores(platform_id, external_event_id, market);
create index idx_odds_lookup on odds_quotes(platform_id, external_event_id, market);
create index idx_fixtures_kickoff on fixtures(kickoff_at);
create index idx_fixtures_status on fixtures(status);
create index idx_vault_user on vault_entries(user_id, status);

alter table platforms enable row level security;
alter table decodes enable row level security;
alter table decoded_selections enable row level security;
alter table confidence_scores enable row level security;
alter table odds_quotes enable row level security;
alter table fixtures enable row level security;
alter table vault_entries enable row level security;
alter table user_settings enable row level security;

-- Reference/cache data: public read, writes via service role only (server-side jobs).
create policy "platforms are publicly readable" on platforms for select using (true);
create policy "fixtures are publicly readable" on fixtures for select using (true);
create policy "confidence scores are publicly readable" on confidence_scores for select using (true);
create policy "odds quotes are publicly readable" on odds_quotes for select using (true);
create policy "decodes are publicly readable" on decodes for select using (true);
create policy "decoded selections are publicly readable" on decoded_selections for select using (true);

-- User-owned data: only the owning user can read/write their rows.
create policy "users manage their own vault entries" on vault_entries
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "users manage their own settings" on user_settings
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
