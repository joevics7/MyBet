-- Team ids differ between football-data.org and API-Football, so top-ups are kept per provider.
alter table team_form_topup add column if not exists provider text not null default 'apifootball';
alter table team_form_topup drop constraint if exists team_form_topup_pkey;
alter table team_form_topup add primary key (team_id, provider);
