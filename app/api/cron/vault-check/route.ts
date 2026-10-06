import { NextRequest, NextResponse } from 'next/server';
import { getPlatform } from '@/lib/services/platforms';
import { sendMessage } from '@/lib/services/telegram';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

export const runtime = 'nodejs';
export const maxDuration = 30;

const MAX_ENTRIES_PER_RUN = 50; // SportyBet decode calls only -- no football-data.org rate limit here, but still bounding for safety

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

  const { data: entries, error: entriesError } = await admin
    .from('vault_entries')
    .select('id, user_id, code, status, platforms(slug)')
    .eq('status', 'pending')
    .limit(MAX_ENTRIES_PER_RUN);

  if (entriesError) {
    return NextResponse.json({ error: 'Failed to fetch pending entries' }, { status: 500 });
  }
  if (!entries || entries.length === 0) {
    return NextResponse.json({ checked: 0, settled: 0, notified: 0 });
  }

  // vault_entries and user_settings both reference auth.users but aren't
  // FK'd to each other, so this can't be embedded in the query above --
  // a second lookup for telegram_chat_id, scoped to just the users with
  // a pending entry in this batch.
  const userIds = Array.from(new Set(entries.map((e) => e.user_id)));
  const { data: settings } = await admin
    .from('user_settings')
    .select('user_id, telegram_chat_id')
    .in('user_id', userIds);
  const chatIdByUser = new Map((settings ?? []).map((s) => [s.user_id, s.telegram_chat_id]));

  let settledCount = 0;
  let notifiedCount = 0;

  for (const entry of entries) {
    const platformSlug = (entry.platforms as unknown as { slug: string } | null)?.slug;

    // Only SportyBet reports settlement via decode -- see sportybet.ts /
    // bet9ja.ts comments. Mark others unable_to_check once, rather than
    // re-attempting them forever on every future run.
    if (!getPlatform(platformSlug)?.canSettle) {
      await admin.from('vault_entries').update({ status: 'unable_to_check' }).eq('id', entry.id);
      continue;
    }

    try {
      const decoded = await getPlatform(platformSlug)!.decode(entry.code);
      if (decoded.status !== 'ok' || decoded.selections.length === 0) continue; // couldn't re-decode right now -- leave pending, try again next run

      const allSettled = decoded.selections.every((s) => s.isWinning !== null);
      if (!allSettled) continue; // still has an unfinished leg

      const legsCorrect = decoded.selections.filter((s) => s.isWinning === true).length;
      const won = legsCorrect === decoded.selections.length;
      const newStatus = won ? 'won' : 'lost';

      await admin
        .from('vault_entries')
        .update({
          status: newStatus,
          settled_at: new Date().toISOString(),
          legs_total: decoded.selections.length,
          legs_correct: legsCorrect,
        })
        .eq('id', entry.id);

      settledCount++;

      const chatId = chatIdByUser.get(entry.user_id);
      if (chatId) {
        const resultWord = won ? 'WON' : 'lost';
        await sendMessage(
          chatId,
          `Your saved code ${entry.code} ${resultWord}. ${legsCorrect}/${decoded.selections.length} selections correct.`,
        );
        notifiedCount++;
      }
    } catch (err) {
      console.error('[vault-check cron] entry check failed, leaving pending:', entry.id, err);
    }
  }

  return NextResponse.json({ checked: entries.length, settled: settledCount, notified: notifiedCount });
}
