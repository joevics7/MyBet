import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Server-only. Uses the service role key, which bypasses RLS -- never
// import this from a client component or expose it to the browser.
// Lazily created (not at module load) so a route that imports this file
// doesn't crash on cold start if the env vars aren't configured yet; it
// only throws once something actually tries to use it.
let cached: SupabaseClient | null = null;

export function getSupabaseAdmin(): SupabaseClient {
  if (cached) return cached;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      'Supabase admin client requested but NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not set.',
    );
  }

  cached = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return cached;
}
