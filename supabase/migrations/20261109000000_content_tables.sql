-- Blog + tool SEO content tables.
-- Same structure as the Toolbase admin (onlinetoolsng/ngonlinetools-0bb43d8d)
-- so ONE content writer/rewriter can serve both sites.

-- ── Roles (used by the admin writer's RLS) ─────────────────────────────
do $$ begin
  create type public.app_role as enum ('admin', 'editor');
exception when duplicate_object then null; end $$;

create table if not exists public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);
alter table public.user_roles enable row level security;

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;

-- ── Blog articles ──────────────────────────────────────────────────────
create table if not exists public.articles (
  slug text primary key,
  category_slug text not null,
  countries text[] not null default '{}',
  related_tool_slugs text[] not null default '{}',
  published boolean not null default false,
  published_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.article_translations (
  article_slug text not null references public.articles(slug) on delete cascade,
  locale text not null default 'en',
  title text not null,
  excerpt text,
  content text not null default '',
  meta_description text,
  og_image_url text,
  reading_time_minutes integer not null default 1,
  is_translated boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (article_slug, locale)
);

-- ── Tool page SEO content (one row per tool + locale) ──────────────────
create table if not exists public.tool_translations (
  tool_slug text not null,
  locale text not null default 'en',
  title text not null,
  description text,
  meta_description text,
  article_title text,
  article_body text,
  content_addition text,
  faq jsonb not null default '[]'::jsonb,
  image_url text,
  image_alt text,
  last_updated date,
  reviewer_name text,
  source_url text,
  is_translated boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (tool_slug, locale)
);

create index if not exists articles_published_idx on public.articles (published, published_at desc);
create index if not exists articles_category_idx on public.articles (category_slug);

alter table public.articles enable row level security;
alter table public.article_translations enable row level security;
alter table public.tool_translations enable row level security;

-- ── Policies: public reads published content, admins write ─────────────
create policy "Users can view their own roles" on public.user_roles
  for select to authenticated using (auth.uid() = user_id);

create policy "Public can read published articles" on public.articles
  for select to anon, authenticated using (published = true);
create policy "Public can read published article translations" on public.article_translations
  for select to anon, authenticated
  using (exists (select 1 from public.articles a where a.slug = article_slug and a.published = true));
create policy "Public can read tool translations" on public.tool_translations
  for select to anon, authenticated using (true);

create policy "Admins manage articles" on public.articles
  for all to authenticated
  using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));
create policy "Admins manage article translations" on public.article_translations
  for all to authenticated
  using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));
create policy "Admins manage tool translations" on public.tool_translations
  for all to authenticated
  using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));

grant select on public.articles, public.article_translations, public.tool_translations to anon;
grant select, insert, update, delete on public.articles, public.article_translations, public.tool_translations to authenticated;
grant select on public.user_roles to authenticated;
grant all on public.articles, public.article_translations, public.tool_translations, public.user_roles to service_role;
grant execute on function public.has_role(uuid, public.app_role) to authenticated, anon;
