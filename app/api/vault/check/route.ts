import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getPlatform } from '@/lib/services/platforms';

export const runtime = 'nodejs';

// Deliberately NOT using the service-role admin client here. This route
// updates a vault entry by ID, and if it used the admin client (which
// bypasses RLS entirely), anyone who knew or guessed another user's
// entry ID could trigger an update on it. Instead, this builds a
// request-scoped client using the ANON key + the caller's own access
// token, so every query below runs AS that user and Postgres's existing
// RLS policy ("users manage their own vault entries") is what actually
// enforces ownership -- not application logic that could have a bug in it.
function getUserScopedClient(accessToken: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) throw new Error('Supabase not configured');

  return createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  }
  const accessToken = authHeader.slice('Bearer '.length);

  let body: { entryId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  if (!body.entryId) {
    return NextResponse.json({ error: 'entryId is required' }, { status: 400 });
  }

  let client;
  try {
    client = getUserScopedClient(accessToken);
  } catch {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
  }

  // RLS means this can only ever return a row the caller actually owns --
  // a made-up or someone-else's entryId just comes back empty, same as
  // "not found," which is the correct behavior either way.
  const { data: entry } = await client
    .from('vault_entries')
    .select('id, code, status, platforms(slug)')
    .eq('id', body.entryId)
    .maybeSingle();

  if (!entry) {
    return NextResponse.json({ error: 'Entry not found' }, { status: 404 });
  }

  const platformSlug = (entry.platforms as unknown as { slug: string } | null)?.slug;

  // Only SportyBet's decode response reports settlement (isWinning) per
  // leg -- see sportybet.ts / bet9ja.ts comments. Bet9ja entries can't be
  // checked this way yet (needs the separate Fixture/Results Feed, not
  // built). Report that honestly rather than guessing or staying silent.
  if (!getPlatform(platformSlug)?.canSettle) {
    await client.from('vault_entries').update({ status: 'unable_to_check' }).eq('id', entry.id);
    return NextResponse.json({ status: 'unable_to_check', reason: `${platformSlug} result-checking not available yet` });
  }

  const decoded = await getPlatform(platformSlug)!.decode(entry.code);
  if (decoded.status !== 'ok' || decoded.selections.length === 0) {
    // Code may have expired/become unreadable -- leave status as-is
    // rather than guessing; the user can retry later.
    return NextResponse.json({ status: entry.status, reason: 'Could not re-decode this code right now' });
  }

  const allSettled = decoded.selections.every((s) => s.isWinning !== null);
  if (!allSettled) {
    return NextResponse.json({ status: 'pending', legsTotal: decoded.selections.length });
  }

  const legsCorrect = decoded.selections.filter((s) => s.isWinning === true).length;
  const won = legsCorrect === decoded.selections.length;
  const newStatus = won ? 'won' : 'lost';

  await client
    .from('vault_entries')
    .update({
      status: newStatus,
      settled_at: new Date().toISOString(),
      legs_total: decoded.selections.length,
      legs_correct: legsCorrect,
    })
    .eq('id', entry.id);

  return NextResponse.json({ status: newStatus, legsCorrect, legsTotal: decoded.selections.length });
}
