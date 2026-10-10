import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { getSessionUserId } from '@/lib/session';
import { getPlatform } from '@/lib/services/platforms';
import { sendMessage } from '@/lib/services/telegram';

export const runtime = 'nodejs';
export const maxDuration = 20;

const CODE_PATTERN = /^[A-Za-z0-9]{4,20}$/;

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

  const platform = getPlatform(body.platform);
  const code = body.code?.trim();
  if (!platform || !code || !CODE_PATTERN.test(code)) {
    return NextResponse.json({ error: 'Enter a valid platform and booking code.' }, { status: 400 });
  }

  const admin = getSupabaseAdmin();

  const decoded = await platform.decode(code);
  if (decoded.status !== 'ok' || decoded.selections.length === 0) {
    return NextResponse.json({ error: "Couldn't decode that code — check it's correct." }, { status: 422 });
  }

  const { data: platformRow } = await admin.from('platforms').select('id').eq('slug', platform.slug).maybeSingle();

  const { error } = await admin.from('vault_entries').insert({
    tg_user_id: userId,
    platform_id: platformRow?.id ?? null,
    code,
    legs_total: decoded.selections.length,
    status: 'pending',
  });

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: "You've already saved this code." }, { status: 409 });
    }
    console.error('[vault entries] insert failed:', error);
    return NextResponse.json({ error: "Couldn't save that entry." }, { status: 500 });
  }

  // Tell them on Telegram that it's saved -- and be honest if this platform
  // can't report results, so they aren't waiting for an alert that won't come.
  const { data: tgUser } = await admin.from('telegram_users').select('chat_id').eq('id', userId).maybeSingle();
  if (tgUser?.chat_id) {
    const total = decoded.totalOdds ? ` @ ${decoded.totalOdds} total odds` : '';
    const tail = platform.canSettle
      ? "I'll message you here as soon as it settles (checked hourly)."
      : `Heads up: ${platform.label} doesn't report results to us yet, so I can't auto-check this one.`;
    try {
      await sendMessage(
        tgUser.chat_id,
        `\uD83D\uDCBE Saved your ${platform.label} code ${code}: ${decoded.selections.length} selections${total}.\n${tail}`,
      );
    } catch (err) {
      console.error('[vault entries] save notification failed:', err);
    }
  }

  return NextResponse.json({ ok: true, legsTotal: decoded.selections.length });
}
