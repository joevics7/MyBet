-- Applied directly to the Edubase Supabase project (id: ztpuknaghrgchcekodfj)
-- via Supabase MCP. This file mirrors that schema for version control.

create table countries (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  flag_emoji text,
  region text,
  currency_code text,
  launch_phase int not null default 1,
  is_live boolean not null default false,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create table categories (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  description text,
  icon text
);

create table tools (
  id uuid primary key default gen_random_uuid(),
  slug text not null,
  title text not null,
  tagline text,
  country_id uuid references countries(id) on delete set null,
  category_id uuid references categories(id) on delete set null,
  language text not null default 'en',
  translated_from uuid references tools(id) on delete set null,
  description_md text,
  how_it_works_md text,
  faq jsonb default '[]'::jsonb,
  official_source_url text,
  official_source_name text,
  schema_types text[] default array['FAQPage'],
  author_name text,
  reviewer_name text,
  status text not null default 'draft' check (status in ('draft','published','archived')),
  meta_title text,
  meta_description text,
  last_reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (country_id, slug, language)
);

create table scholarships (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  title text not null,
  summary text,
  country_id uuid references countries(id) on delete set null,
  level text check (level in ('undergraduate','masters','phd','postdoc','any')),
  funding_type text check (funding_type in ('full','partial','tuition_only','stipend_only')),
  field text,
  benefits_md text,
  eligibility_md text,
  eligibility_source_url text,
  required_documents_md text,
  application_process_md text,
  official_apply_url text,
  deadline date,
  is_closed boolean not null default false,
  language text not null default 'en',
  status text not null default 'draft' check (status in ('draft','published','archived')),
  last_reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table blog_posts (
  id uuid primary key default gen_random_uuid(),
  slug text not null,
  title text not null,
  excerpt text,
  content_md text,
  country_id uuid references countries(id) on delete set null,
  language text not null default 'en',
  translated_from uuid references blog_posts(id) on delete set null,
  author_name text,
  reviewer_name text,
  status text not null default 'draft' check (status in ('draft','published','archived')),
  published_at timestamptz,
  last_reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (slug, language)
);

create index idx_tools_country on tools(country_id);
create index idx_tools_category on tools(category_id);
create index idx_scholarships_country on scholarships(country_id);
create index idx_scholarships_deadline on scholarships(deadline);
create index idx_blog_country on blog_posts(country_id);

alter table countries enable row level security;
alter table categories enable row level security;
alter table tools enable row level security;
alter table scholarships enable row level security;
alter table blog_posts enable row level security;

create policy "public read countries" on countries for select using (true);
create policy "public read categories" on categories for select using (true);
create policy "public read published tools" on tools for select using (status = 'published');
create policy "public read published scholarships" on scholarships for select using (status = 'published');
create policy "public read published blog posts" on blog_posts for select using (status = 'published');

insert into categories (slug, name, description, icon) values
('scholarship-tools','Scholarship Tools','Eligibility matchers & deadline trackers','award'),
('language-test-prep','Language & Test Prep','IELTS, TOEFL, SAT, GRE practice','languages'),
('career-vocational','Career & Vocational','TVET placement & professional exams','briefcase'),
('application-documents','Application & Documents','Essay tools & application trackers','file-text');

-- Quizzes: a distinct content type from tools/scholarships/guides.
-- Same country + language pattern (real translated routes, no locale system).
create table quiz_categories (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  icon text
);

create table quizzes (
  id uuid primary key default gen_random_uuid(),
  slug text not null,
  title text not null,
  description text,
  country_id uuid references countries(id) on delete set null,
  quiz_category_id uuid references quiz_categories(id) on delete set null,
  language text not null default 'en',
  translated_from uuid references quizzes(id) on delete set null,
  questions jsonb not null default '[]'::jsonb,
  status text not null default 'draft' check (status in ('draft','published','archived')),
  author_name text,
  play_count int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (country_id, slug, language)
);

create index idx_quizzes_country on quizzes(country_id);
create index idx_quizzes_category on quizzes(quiz_category_id);

alter table quiz_categories enable row level security;
alter table quizzes enable row level security;

create policy "public read quiz categories" on quiz_categories for select using (true);
create policy "public read published quizzes" on quizzes for select using (status = 'published');

insert into quiz_categories (slug, name, icon) values
('exam-prep','Education & Exam Prep','graduation-cap'),
('general-knowledge','General Knowledge','brain'),
('science-nature','Science & Nature','microscope'),
('history-civics','History & Civics','landmark'),
('geography','Geography','globe'),
('current-affairs','Current Affairs','newspaper');

-- Scholarship tracker display control, no new table needed
alter table scholarships add column is_featured boolean not null default false;
alter table scholarships add column board_priority int;
comment on column scholarships.is_featured is 'Shown in the Tracker''s spotlight rail, independent of funding_type';
comment on column scholarships.board_priority is 'Optional manual sort override for the Tracker deadline board; falls back to deadline ascending when null';

-- Glanceable fields for the Tracker board — deliberately short, distinct
-- from the long-form *_md columns individual scholarship pages will use.
alter table scholarships add column requirements_short text;
alter table scholarships add column amount_short text;
comment on column scholarships.requirements_short is 'Glanceable eligibility for the Tracker board, e.g. "BSc, Masters" or "Age 18-25, IELTS 6.5+" — a few words only, not eligibility_md';
comment on column scholarships.amount_short is 'Glanceable funding amount for the Tracker board, e.g. "Full tuition + $15,000 stipend" or "$5,000" — a few words only, not benefits_md';
comment on column scholarships.summary is 'Short one-line description used on the Tracker board and spotlight cards, not the full listing';

-- Quiz custom UI provision: most quizzes use the generic player, some need
-- a bespoke component keyed off custom_component_key, with config carrying
-- whatever structured data that component needs.
alter table quizzes add column quiz_type text not null default 'standard' check (quiz_type in ('standard','custom'));
alter table quizzes add column custom_component_key text;
alter table quizzes add column config jsonb not null default '{}'::jsonb;
comment on column quizzes.quiz_type is 'standard = generic QuizPlayer using questions[]; custom = rendered by the component registered under custom_component_key';
comment on column quizzes.custom_component_key is 'Key into the custom quiz component registry, used when quiz_type = custom';
comment on column quizzes.config is 'Arbitrary structured data a custom quiz component needs (scoring rules, assets, layout) beyond questions[]';
