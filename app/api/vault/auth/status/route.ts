import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { setSessionCookie } from '@/lib/session';

export const runtime = 'nodejs';

// Step 2: the website polls this with its token. Once the bot has linked
// a Telegram account to it, we trade the token for a session cookie
// (and delete the token, so it can only be used once).
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token');
  if (!token || !/^[a-f0-9]{32}$/.test(token)) {
    return NextResponse.json({ status: 'expired' });
  }

  const admin = getSupabaseAdmin();
  const { data: row } = await admin
    .from('telegram_login_tokens')
    .select('token, expires_at, telegram_user_id')
    .eq('token', token)
    .maybeSingle();

  if (!row || new Date(row.expires_at).getTime() < Date.now()) {
    return NextResponse.json({ status: 'expired' });
  }
  if (!row.telegram_user_id) {
    return NextResponse.json({ status: 'pending' });
  }

  // Single use: only the request that actually deletes the row gets the session.
  const { data: deleted } = await admin.from('telegram_login_tokens').delete().eq('token', token).select('token');
  if (!deleted || deleted.length === 0) {
    return NextResponse.json({ status: 'expired' });
  }

  const res = NextResponse.json({ status: 'ok' });
  setSessionCookie(res, row.telegram_user_id);
  return res;
}
