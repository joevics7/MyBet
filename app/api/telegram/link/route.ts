import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

const CODE_TTL_MINUTES = 10;

function generateCode(): string {
  // 6 chars, uppercase alphanumeric, avoiding ambiguous chars (0/O, 1/I/L).
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

// User-scoped client (same reasoning as /api/vault/check): the insert
// must run as the actual logged-in user so RLS attaches the right
// user_id and a caller can't create a link code for someone else.
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

  let client;
  try {
    client = getUserScopedClient(accessToken);
  } catch {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
  }

  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  }

  // Clear any of this user's existing unused codes first -- avoids
  // accumulating stale rows every time someone revisits the link UI.
  await client.from('telegram_link_codes').delete().eq('user_id', user.id);

  const code = generateCode();
  const expiresAt = new Date(Date.now() + CODE_TTL_MINUTES * 60 * 1000).toISOString();

  const { error } = await client.from('telegram_link_codes').insert({
    code,
    user_id: user.id,
    expires_at: expiresAt,
  });

  if (error) {
    return NextResponse.json({ error: 'Could not generate a link code' }, { status: 500 });
  }

  return NextResponse.json({ code, expiresAt, ttlMinutes: CODE_TTL_MINUTES });
}
