-- Team ids differ between football-data.org and API-Football, so stored days are kept per provider.
alter table football_results_by_day add column if not exists provider text not null default 'apifootball';
alter table football_results_by_day drop constraint if exists football_results_by_day_pkey;
alter table football_results_by_day add primary key (day, provider);
