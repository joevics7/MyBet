// One-time (re-runnable) push of the menu keyboard to everyone who has
// already used the bot. Telegram only shows the keyboard (and its grid icon)
// after the bot has sent it, and every bot message now carries it -- this
// just reaches people who haven't been messaged since the menu shipped.
//
//   GET https://<your-domain>/api/telegram/refresh-menu
//   header  Authorization: Bearer <CRON_SECRET>
//
// Sends at most ~25 messages/second (Telegram's limit is ~30). Users who
// blocked the bot just fail quietly. Runs inside one 60s function, so it
// covers roughly 1,000+ users per call; add ?offset=N to continue.
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { sendMessage } from '@/lib/services/telegram';

export const runtime = 'nodejs';
export const maxDuration = 60;

const BATCH = 1200;

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const ok = secret ? req.headers.get('authorization') === `Bearer ${secret}` : process.env.NODE_ENV !== 'production';
  if (!ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const offset = Math.max(0, Number(req.nextUrl.searchParams.get('offset')) || 0);
  const admin = getSupabaseAdmin();
  const { data: users, error } = await admin
    .from('telegram_users')
    .select('chat_id')
    .not('chat_id', 'is', null)
    .order('created_at', { ascending: true })
    .range(offset, offset + BATCH - 1);
  if (error) return NextResponse.json({ error: 'Could not load users' }, { status: 500 });

  let sent = 0;
  let failed = 0;
  for (const u of users ?? []) {
    const delivered = await sendMessage(
      u.chat_id,
      'BetMeter now has a menu. Tap the grid icon next to the message box to open it.',
    ).catch(() => false);
    if (delivered) sent++;
    else failed++;
    await new Promise((r) => setTimeout(r, 40));
  }
  const count = users?.length ?? 0;
  return NextResponse.json({ sent, failed, next: count === BATCH ? offset + BATCH : null });
}
