-- Starter platform list. SportyBet ships first per the build order
-- (Decode Service, one platform first); the rest are flagged unsupported
-- until their Decode/Encode services are built.
insert into platforms (slug, name, is_supported_decode, is_supported_encode, sort_order) values
  ('sportybet', 'SportyBet', true, false, 1),
  ('bet9ja', 'Bet9ja', false, false, 2),
  ('1xbet', '1xBet', false, false, 3),
  ('betking', 'BetKing', false, false, 4)
on conflict (slug) do nothing;
