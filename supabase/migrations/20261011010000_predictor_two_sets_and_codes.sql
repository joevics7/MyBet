-- Pre-created booking codes stored on each ticket: [{slug,label,code,deepLink,totalOdds}]
alter table predictor_tickets
  add column if not exists booking_codes jsonb not null default '[]'::jsonb;

-- A day now has two sets of tickets (odds_basis 'bookmaker' and 'model'),
-- so a ticket is unique per date + band + set, not per date + band.
alter table predictor_tickets drop constraint if exists predictor_tickets_ticket_date_target_band_key;
alter table predictor_tickets
  add constraint predictor_tickets_date_band_basis_key unique (ticket_date, target_band, odds_basis);
