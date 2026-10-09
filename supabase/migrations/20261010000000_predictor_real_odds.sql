-- Predictor: tickets are now built from real bookmaker odds when available
-- (SportyBet's feed), falling back to model-implied odds. Adds the fields the
-- page needs to show that honestly. All nullable / defaulted, so existing rows
-- (which were model-odds) stay valid.

alter table predictor_tickets
  add column if not exists odds_basis text not null default 'model'; -- 'bookmaker' | 'model'

alter table predictor_ticket_selections
  add column if not exists book_odds numeric(10,2),        -- real bookmaker price for the pick
  add column if not exists book_name text,                 -- e.g. 'SportyBet'
  add column if not exists model_probability numeric(5,4); -- our model's chance, 0-1
