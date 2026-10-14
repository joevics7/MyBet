// Shared "save a code to the Vault" logic. Used by the website
// (POST /api/vault/entries) and the Telegram bot (/save), so both validate,
// dedupe and word their confirmation identically.

import type { SupabaseClient } from '@supabase/supabase-js';
import { getPlatform } from './platforms';

export const VAULT_CODE_PATTERN = /^[A-Za-z0-9]{4,20}$/;

export type SaveOutcome =
  | { ok: true; confirmation: string; legsTotal: number }
  | { ok: false; status: 400 | 409 | 422 | 500; error: string };

export async function saveVaultEntry(
  admin: SupabaseClient,
  input: { tgUserId: string; platformSlug: string | undefined; code: string | undefined },
): Promise<SaveOutcome> {
  const platform = getPlatform(input.platformSlug);
  const code = input.code?.trim();
  if (!platform || !code || !VAULT_CODE_PATTERN.test(code)) {
    return { ok: false, status: 400, error: 'Enter a valid platform and booking code.' };
  }

  const decoded = await platform.decode(code);
  if (decoded.status !== 'ok' || decoded.selections.length === 0) {
    return { ok: false, status: 422, error: "Couldn't decode that code \u2014 check it's correct." };
  }

  const { data: platformRow } = await admin.from('platforms').select('id').eq('slug', platform.slug).maybeSingle();

  const { error } = await admin.from('vault_entries').insert({
    tg_user_id: input.tgUserId,
    platform_id: platformRow?.id ?? null,
    code,
    legs_total: decoded.selections.length,
    status: 'pending',
  });

  if (error) {
    if (error.code === '23505') {
      return { ok: false, status: 409, error: "You've already saved this code." };
    }
    console.error('[vaultSave] insert failed:', error);
    return { ok: false, status: 500, error: "Couldn't save that entry." };
  }

  // Be honest if this platform can't report results, so nobody waits for an
  // alert that won't come.
  const total = decoded.totalOdds ? ` @ ${decoded.totalOdds} total odds` : '';
  const tail = platform.canSettle
    ? "I'll message you here as soon as it settles (checked hourly)."
    : `Heads up: ${platform.label} doesn't report results to us yet, so I can't auto-check this one.`;

  return {
    ok: true,
    legsTotal: decoded.selections.length,
    confirmation: `\uD83D\uDCBE Saved your ${platform.label} code ${code}: ${decoded.selections.length} selections${total}.\n${tail}`,
  };
}
