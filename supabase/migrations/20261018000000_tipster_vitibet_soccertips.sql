-- Adds the two new score sources (Vitibet, SoccerTips) to the tipster cache, and a nullable fixture_id
-- (Vitibet publishes a fixture id per match that looks like an API-Football id -- stored as text, only
-- trusted when the team names also agree, see tipsterConsensus.ts).

alter table tipster_predictions drop constraint if exists tipster_predictions_source_check;
alter table tipster_predictions
  add constraint tipster_predictions_source_check
  check (source in ('statarea', 'predictz', 'forebet', 'vitibet', 'soccertips'));

alter table tipster_predictions add column if not exists fixture_id text;
