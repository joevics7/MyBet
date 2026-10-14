import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { getSessionUserId } from '@/lib/session';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const userId = getSessionUserId(req);
  if (!userId) return NextResponse.json({ user: null });

  const admin = getSupabaseAdmin();
  const { data } = await admin
    .from('telegram_users')
    .select('username, first_name')
    .eq('id', userId)
    .maybeSingle();

  if (!data) return NextResponse.json({ user: null });
  return NextResponse.json({ user: { username: data.username, firstName: data.first_name } });
}
