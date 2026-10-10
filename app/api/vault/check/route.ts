import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { getSessionUserId } from '@/lib/session';
import { settleEntry } from '@/lib/services/vaultSettle';

export const runtime = 'nodejs';
export const maxDuration = 20;

// Manual "check now". Ownership is enforced in the query itself
// (tg_user_id = the session's user), so a guessed entry ID belonging to
// someone else just comes back as "not found".
export async function POST(req: NextRequest) {
  const userId = getSessionUserId(req);
  if (!userId) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

  let body: { entryId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  if (!body.entryId) return NextResponse.json({ error: 'entryId is required' }, { status: 400 });

  const admin = getSupabaseAdmin();
  const { data: entry } = await admin
    .from('vault_entries')
    .select('id, code, status, platforms(slug), telegram_users(chat_id)')
    .eq('id', body.entryId)
    .eq('tg_user_id', userId)
    .maybeSingle();

  if (!entry) return NextResponse.json({ error: 'Entry not found' }, { status: 404 });
  if (entry.status !== 'pending') return NextResponse.json({ status: entry.status });

  const outcome = await settleEntry(admin, {
    id: entry.id,
    code: entry.code,
    platformSlug: (entry.platforms as unknown as { slug: string } | null)?.slug,
    chatId: (entry.telegram_users as unknown as { chat_id: number } | null)?.chat_id ?? null,
  });

  if (outcome.state === 'settled') {
    return NextResponse.json({ status: outcome.status, legsCorrect: outcome.legsCorrect, legsTotal: outcome.legsTotal });
  }
  if (outcome.state === 'unable_to_check') {
    return NextResponse.json({ status: 'unable_to_check', reason: 'Result-checking not available for this platform yet' });
  }
  return NextResponse.json({ status: 'pending', legsTotal: outcome.legsTotal, reason: outcome.reason });
}
