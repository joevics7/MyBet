import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { getSessionUserId } from '@/lib/session';
import { saveVaultEntry } from '@/lib/services/vaultSave';
import { sendMessage } from '@/lib/services/telegram';

export const runtime = 'nodejs';
export const maxDuration = 20;

export async function GET(req: NextRequest) {
  const userId = getSessionUserId(req);
  if (!userId) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from('vault_entries')
    .select('id, code, status, legs_total, legs_correct, saved_at, platforms(slug, name)')
    .eq('tg_user_id', userId)
    .order('saved_at', { ascending: false });

  if (error) return NextResponse.json({ error: 'Could not load your codes' }, { status: 500 });
  return NextResponse.json({ entries: data ?? [] });
}

export async function POST(req: NextRequest) {
  const userId = getSessionUserId(req);
  if (!userId) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

  let body: { platform?: string; code?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  const result = await saveVaultEntry(admin, { tgUserId: userId, platformSlug: body.platform, code: body.code });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

  // Confirm on Telegram too, so the save is visible where alerts will arrive.
  const { data: tgUser } = await admin.from('telegram_users').select('chat_id').eq('id', userId).maybeSingle();
  if (tgUser?.chat_id) {
    try {
      await sendMessage(tgUser.chat_id, result.confirmation);
    } catch (err) {
      console.error('[vault entries] save notification failed:', err);
    }
  }

  return NextResponse.json({ ok: true, legsTotal: result.legsTotal });
}
