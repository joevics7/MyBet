// Shared settle-and-notify logic for one Vault entry. Used by the hourly
// cron (/api/cron/vault-check) and the manual "check now" button
// (/api/vault/check), so both behave identically and a result is only
// ever announced once (only 'pending' entries are processed, and settling
// flips the status).

import type { SupabaseClient } from '@supabase/supabase-js';
import { getPlatform } from './platforms';
import { sendMessage } from './telegram';

export interface SettleInput {
  id: string;
  code: string;
  platformSlug: string | undefined;
  chatId: number | string | null;
}

export type SettleOutcome =
  | { state: 'unable_to_check' }
  | { state: 'pending'; reason?: string; legsTotal?: number }
  | { state: 'settled'; status: 'won' | 'lost'; legsCorrect: number; legsTotal: number; notified: boolean };

export async function settleEntry(admin: SupabaseClient, entry: SettleInput): Promise<SettleOutcome> {
  const platform = getPlatform(entry.platformSlug);

  // Only some platforms report per-leg results via decode (see
  // platforms.ts canSettle). Mark the rest once instead of retrying forever.
  if (!platform?.canSettle) {
    await admin.from('vault_entries').update({ status: 'unable_to_check' }).eq('id', entry.id);
    return { state: 'unable_to_check' };
  }

  const decoded = await platform.decode(entry.code);
  if (decoded.status !== 'ok' || decoded.selections.length === 0) {
    return { state: 'pending', reason: 'Could not re-decode this code right now' };
  }

  const legsTotal = decoded.selections.length;
  if (!decoded.selections.every((s) => s.isWinning !== null)) {
    return { state: 'pending', legsTotal };
  }

  const legsCorrect = decoded.selections.filter((s) => s.isWinning === true).length;
  const status = legsCorrect === legsTotal ? 'won' : 'lost';

  // Guarded on status='pending' so two overlapping runs can't both settle
  // (and both notify) the same entry.
  const { data: updated } = await admin
    .from('vault_entries')
    .update({ status, settled_at: new Date().toISOString(), legs_total: legsTotal, legs_correct: legsCorrect })
    .eq('id', entry.id)
    .eq('status', 'pending')
    .select('id');

  if (!updated || updated.length === 0) {
    return { state: 'settled', status, legsCorrect, legsTotal, notified: false };
  }

  let notified = false;
  if (entry.chatId) {
    const label = platform.label;
    const text =
      status === 'won'
        ? `\u2705 WON! Your ${label} code ${entry.code} came in: ${legsCorrect}/${legsTotal} selections correct.`
        : `\u274C Lost. Your ${label} code ${entry.code}: ${legsCorrect}/${legsTotal} selections correct.`;
    try {
      notified = await sendMessage(entry.chatId, text);
    } catch (err) {
      console.error('[vaultSettle] notify failed:', entry.id, err);
    }
  }

  return { state: 'settled', status, legsCorrect, legsTotal, notified };
}
