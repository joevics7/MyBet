-- Vault becomes Telegram-only: identity is a Telegram account, not a
-- Supabase Auth (email) user. All access goes through server routes that
-- verify a signed session cookie and use the service-role client, so these
-- tables get RLS enabled with NO policies (anon/authenticated keys can't
-- read or write them directly).

create table telegram_users (
  id uuid primary key default gen_random_uuid(),
  telegram_id bigint not null unique,
  chat_id bigint not null,
  username text,
  first_name text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

-- Short-lived one-time login tokens. The website creates one, the user
-- opens t.me/<bot>?start=login_<token>, and the bot webhook fills in
-- telegram_user_id. The website polls until that happens.
create table telegram_login_tokens (
  token text primary key,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  telegram_user_id uuid references telegram_users(id) on delete cascade
);
create index idx_telegram_login_tokens_expires on telegram_login_tokens(expires_at);

alter table telegram_users enable row level security;
alter table telegram_login_tokens enable row level security;

-- vault_entries: owned by a Telegram user now. user_id (old email
-- accounts) stays nullable so any legacy rows survive but are no longer
-- reachable from the app.
alter table vault_entries add column tg_user_id uuid references telegram_users(id) on delete cascade;
alter table vault_entries alter column user_id drop not null;
alter table vault_entries add constraint vault_entries_has_owner check (user_id is not null or tg_user_id is not null);

create unique index vault_entries_tg_unique on vault_entries(tg_user_id, platform_id, code) where tg_user_id is not null;
create index idx_vault_tg_user on vault_entries(tg_user_id, status);

drop policy if exists "users manage their own vault entries" on vault_entries;

-- Replaced by telegram_login_tokens (no more /link codes).
drop table if exists telegram_link_codes;
