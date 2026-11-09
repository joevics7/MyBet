-- The football API data is no longer saved anywhere (2026-11-08): each predictor run fetches the day's list and the best 40
-- games' predictions into memory and uses them. These tables are not used any more.
drop table if exists football_predictions;
drop table if exists football_day_fixtures;
drop table if exists football_api_usage;
delete from football_results_by_day where provider = 'apifootball';
