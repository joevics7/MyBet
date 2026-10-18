-- Team-name registry: one row per real team, many spellings per team (tipster sites now, betting platforms
-- later). Filled by /api/cron/team-aliases; read by the tipster matcher. Writes are service-role only.

create table team_aliases (
  id uuid primary key default gen_random_uuid(),
  canonical_name text not null,
  canonical_key text not null unique, -- normalised canonical name, see teamKey() in teamNameMatch.ts
  created_at timestamptz not null default now()
);

create table team_alias_variants (
  id uuid primary key default gen_random_uuid(),
  alias_id uuid not null references team_aliases(id) on delete cascade,
  variant text not null, -- the spelling exactly as the source wrote it
  variant_key text not null unique, -- normalised; one spelling can belong to only one team
  source text not null, -- 'vitibet', 'statarea', 'predictz', 'soccertips', or a betting platform name
  learned_via text not null check (learned_via in ('spine', 'fuzzy', 'ai', 'platform', 'manual')),
  created_at timestamptz not null default now()
);

create index idx_team_alias_variants_alias on team_alias_variants(alias_id);

alter table team_aliases enable row level security;
alter table team_alias_variants enable row level security;

create policy "team aliases are publicly readable" on team_aliases for select using (true);
create policy "team alias variants are publicly readable" on team_alias_variants for select using (true);
