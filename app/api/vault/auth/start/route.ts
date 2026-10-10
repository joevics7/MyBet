import { NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

export const runtime = 'nodejs';

const TOKEN_TTL_MINUTES = 10;

// Step 1 of Telegram sign-in: create a one-time token and hand back a
// t.me deep link. The user taps it, presses Start in the bot, and the
// webhook attaches their Telegram account to this token.
export async function POST() {
  let admin;
  try {
    admin = getSupabaseAdmin();
  } catch {
    return NextResponse.json({ error: 'Vault is not configured yet' }, { status: 500 });
  }

  // Opportunistic cleanup so abandoned tokens don't pile up.
  await admin.from('telegram_login_tokens').delete().lt('expires_at', new Date().toISOString());

  const token = crypto.randomBytes(16).toString('hex'); // 32 chars, fits Telegram's start-param rules
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MINUTES * 60 * 1000).toISOString();

  const { error } = await admin.from('telegram_login_tokens').insert({ token, expires_at: expiresAt });
  if (error) {
    console.error('[vault auth start] insert failed:', error);
    return NextResponse.json({ error: 'Could not start sign-in' }, { status: 500 });
  }

  const botUsername = process.env.TELEGRAM_BOT_USERNAME || 'BetsMeterBot';
  return NextResponse.json({
    token,
    deepLink: `https://t.me/${botUsername}?start=login_${token}`,
    ttlMinutes: TOKEN_TTL_MINUTES,
  });
}
