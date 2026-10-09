-- Booking codes and the raw bookmaker responses are not public data.
-- `decodes` and `decoded_selections` were readable by anyone holding the public
-- (anon) key. They are only ever read and written by server routes using the
-- service-role key, which bypasses RLS, so removing the public policies loses
-- nothing. With RLS enabled and no policy, anon/authenticated users get no access.
drop policy if exists "decodes are publicly readable" on decodes;
drop policy if exists "decoded selections are publicly readable" on decoded_selections;
