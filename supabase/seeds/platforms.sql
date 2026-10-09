-- Platform list. Slugs must match lib/platformList.ts and lib/services/platforms.ts
-- (the Decoder looks up platform_id by slug; the Vault needs it to re-check codes).
-- Flags mirror the adapters: decode = we can read codes, encode = we can create them.
-- Safe to re-run (on conflict do nothing).
insert into platforms (slug, name, is_supported_decode, is_supported_encode, deep_link_template, sort_order) values
  ('sportybet',   'SportyBet',    true,  true,  'https://www.sportybet.com/ng/?shareCode={code}', 1),
  ('footballcom', 'Football.com', true,  true,  'https://www.football.com/ng/m?shareCode={code}', 2),
  ('msport',      'MSport',       true,  true,  null, 3),
  ('betway',      'Betway',       true,  true,  null, 4),
  ('bangbet',     'Bangbet',      true,  false, 'https://www.bangbet.com/static/share/book.html?{code}', 5),
  ('bet9ja',      'Bet9ja',       true,  false, null, 6),
  ('stake',       'Stake',        true,  false, null, 7),
  ('1xbet',       '1xBet',        false, false, null, 8),
  ('betking',     'BetKing',      false, false, null, 9),
  ('nairabet',    'NairaBet',     false, false, null, 10)
on conflict (slug) do nothing;
