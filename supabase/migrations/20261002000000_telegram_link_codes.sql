-- Short-lived codes for linking a web account to a Telegram chat. A
-- logged-in user generates one on the website, then sends /link <code>
-- to the bot -- the webhook (no user session of its own) looks it up by
-- code alone, so this needs its own table rather than reusing a
-- session-scoped mechanism.

create table telegram_link_codes (
  code text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index idx_telegram_link_codes_user on telegram_link_codes(user_id);

alter table telegram_link_codes enable row level security;

-- Owner can create/see their own pending codes (to show "code sent,
-- waiting..." state in the UI). The webhook looks codes up via the
-- service-role client, which bypasses RLS, since it has no user session.
create policy "users manage their own link codes" on telegram_link_codes
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
