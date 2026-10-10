import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { settleEntry } from '@/lib/services/vaultSettle';

export const runtime = 'nodejs';
export const maxDuration = 60;

// Hit hourly by cronjob.org (GET, with header
// "Authorization: Bearer <CRON_SECRET>"). Re-checks every pending Vault
// code and sends the owner a Telegram message when it settles as won/lost.
const MAX_ENTRIES_PER_RUN = 50;

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  return req.headers.get('authorization') === `Bearer ${secret}`;
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    return await runVaultCheck();
  } catch (err) {
    console.error('[vault-check cron] unhandled error:', err);
    return NextResponse.json(
      { error: 'Unhandled error', message: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}

async function runVaultCheck(): Promise<NextResponse> {
  const admin = getSupabaseAdmin();

  // Oldest first, so a backlog beyond MAX_ENTRIES_PER_RUN still drains.
  const { data: entries, error } = await admin
    .from('vault_entries')
    .select('id, code, platforms(slug), telegram_users(chat_id)')
    .eq('status', 'pending')
    .not('tg_user_id', 'is', null)
    .order('saved_at', { ascending: true })
    .limit(MAX_ENTRIES_PER_RUN);

  if (error) {
    console.error('[vault-check cron] fetch failed:', error);
    return NextResponse.json({ error: 'Failed to fetch pending entries' }, { status: 500 });
  }
  if (!entries || entries.length === 0) {
    return NextResponse.json({ checked: 0, settled: 0, notified: 0 });
  }

  let settled = 0;
  let notified = 0;

  for (const entry of entries) {
    try {
      const outcome = await settleEntry(admin, {
        id: entry.id,
        code: entry.code,
        platformSlug: (entry.platforms as unknown as { slug: string } | null)?.slug,
        chatId: (entry.telegram_users as unknown as { chat_id: number } | null)?.chat_id ?? null,
      });
      if (outcome.state === 'settled') {
        settled++;
        if (outcome.notified) notified++;
      }
    } catch (err) {
      console.error('[vault-check cron] entry failed, leaving pending:', entry.id, err);
    }
  }

  return NextResponse.json({ checked: entries.length, settled, notified });
}
