import { NextRequest, NextResponse } from 'next/server';
import { sendMessage, type TelegramUpdate } from '@/lib/services/telegram';
import { decodeSportyBetCode } from '@/lib/services/sportybet';
import { decodeBet9jaCode } from '@/lib/services/bet9ja';
import type { DecodeResult } from '@/lib/services/types';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { getPlatform } from '@/lib/services/platforms';
import { saveVaultEntry } from '@/lib/services/vaultSave';

export const runtime = 'nodejs';
export const maxDuration = 20;

// v1 scope: decode only, no confidence scoring. Scoring each selection
// (football-data.org + Gemini, throttled) is what made /api/decode take
// several seconds -- fine for a web page with a loading spinner, risky
// inside a chat bot where a slow reply reads as broken. Decode-only
// replies in ~1-2s. Scoring can be added once there's a clear answer for
// how to keep response time acceptable (e.g. "send now, score async,
// edit the message after" -- not built yet).
const DECODERS: Record<string, (code: string) => Promise<DecodeResult>> = {
  sportybet: decodeSportyBetCode,
  bet9ja: decodeBet9jaCode,
};

const WELCOME_TEXT = `Welcome to BetMeter!

Paste any SportyBet booking code and I'll decode it for you. Or use:
/decode <code> -- decodes a SportyBet code
/decode <platform> <code> -- e.g. /decode bet9ja 5T6TLPN

Save codes to your Vault right here:
/save <code> -- saves a SportyBet code
/save <platform> <code> -- e.g. /save footballcom ABC123
I'll message you here whenever a saved code settles. (You can also manage your Vault on the website.)

More tools (confidence scores, splitting) are on the way here -- for the full set, visit the website.`;

const BOOKING_CODE_PATTERN = /^[A-Z0-9]{5,10}$/i;

function isAuthorized(req: NextRequest): boolean {
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!expected) return true; // not configured yet -- allow, but should be set before real launch
  return req.headers.get('x-telegram-bot-api-secret-token') === expected;
}

async function handleDecodeCommand(chatId: number, args: string[]) {
  if (args.length === 0) {
    await sendMessage(chatId, 'Send a booking code like this: /decode P79BMH or /decode bet9ja 5T6TLPN');
    return;
  }

  const platform = args.length >= 2 ? args[0].toLowerCase() : 'sportybet';
  const code = args.length >= 2 ? args[1] : args[0];

  const decoder = DECODERS[platform];
  if (!decoder) {
    await sendMessage(chatId, `I don't support "${platform}" yet -- only sportybet and bet9ja for now.`);
    return;
  }

  const result = await decoder(code);
  if (result.status !== 'ok') {
    await sendMessage(chatId, "Couldn't decode that code -- check it's correct and try again.");
    return;
  }

  const lines = result.selections.map(
    (s) => `${s.homeTeam} v ${s.awayTeam}\n${s.market} @ ${s.odds.toFixed(2)}`,
  );
  const totalOddsLine = result.totalOdds ? `\n\nTotal odds: ${result.totalOdds}` : '';
  await sendMessage(chatId, `${result.selections.length} selections:\n\n${lines.join('\n\n')}${totalOddsLine}`);
}

// Website sign-in: the Vault page created a one-time token and sent the
// user here via t.me/<bot>?start=login_<token>. Find/create their Telegram
// account row, attach it to the token, and the website's poll picks it up.
async function handleLoginStart(message: NonNullable<TelegramUpdate['message']>, token: string) {
  const chatId = message.chat.id;

  if (message.chat.type !== 'private' || !message.from || !/^[a-f0-9]{32}$/.test(token)) {
    await sendMessage(chatId, 'That sign-in link is invalid -- go back to the Vault page and try again.');
    return;
  }

  let admin;
  try {
    admin = getSupabaseAdmin();
  } catch {
    await sendMessage(chatId, "Sign-in isn't available right now -- try again later.");
    return;
  }

  const { data: tokenRow } = await admin
    .from('telegram_login_tokens')
    .select('token, expires_at, telegram_user_id')
    .eq('token', token)
    .maybeSingle();

  if (!tokenRow || tokenRow.telegram_user_id || new Date(tokenRow.expires_at).getTime() < Date.now()) {
    await sendMessage(chatId, 'That sign-in link expired -- go back to the Vault page and tap Connect again.');
    return;
  }

  const { data: user, error: userError } = await admin
    .from('telegram_users')
    .upsert(
      {
        telegram_id: message.from.id,
        chat_id: chatId,
        username: message.from.username ?? null,
        first_name: message.from.first_name ?? null,
        last_seen_at: new Date().toISOString(),
      },
      { onConflict: 'telegram_id' },
    )
    .select('id')
    .single();

  if (userError || !user) {
    console.error('[telegram webhook] user upsert failed:', userError);
    await sendMessage(chatId, 'Something went wrong connecting your account -- try again.');
    return;
  }

  const { error: attachError } = await admin
    .from('telegram_login_tokens')
    .update({ telegram_user_id: user.id })
    .eq('token', token)
    .is('telegram_user_id', null);

  if (attachError) {
    console.error('[telegram webhook] token attach failed:', attachError);
    await sendMessage(chatId, 'Something went wrong connecting your account -- try again.');
    return;
  }

  await sendMessage(
    chatId,
    "\u2705 Connected! Go back to the Vault page -- you're signed in. I'll message you here whenever a saved code settles.",
  );
}

// /save <code> or /save <platform> <code>. Telegram itself is the identity,
// so the first /save from someone who never opened the website just creates
// their account row. Private chats only: alerts go to this chat, so it must
// be the user's own DM.
async function handleSaveCommand(message: NonNullable<TelegramUpdate['message']>, args: string[]) {
  const chatId = message.chat.id;

  if (message.chat.type !== 'private' || !message.from) {
    await sendMessage(chatId, 'Message me directly to save codes to your Vault.');
    return;
  }
  if (args.length === 0 || args.length > 2) {
    await sendMessage(chatId, 'Send a booking code like this: /save P79BMH or /save footballcom ABC123');
    return;
  }

  const platformSlug = args.length === 2 ? args[0] : 'sportybet';
  const code = args.length === 2 ? args[1] : args[0];
  if (!getPlatform(platformSlug)) {
    await sendMessage(chatId, `I don't support "${platformSlug}" yet. Try /save <code> for SportyBet.`);
    return;
  }

  let admin;
  try {
    admin = getSupabaseAdmin();
  } catch {
    await sendMessage(chatId, "The Vault isn't available right now -- try again later.");
    return;
  }

  const { data: user, error: userError } = await admin
    .from('telegram_users')
    .upsert(
      {
        telegram_id: message.from.id,
        chat_id: chatId,
        username: message.from.username ?? null,
        first_name: message.from.first_name ?? null,
        last_seen_at: new Date().toISOString(),
      },
      { onConflict: 'telegram_id' },
    )
    .select('id')
    .single();

  if (userError || !user) {
    console.error('[telegram webhook] user upsert failed:', userError);
    await sendMessage(chatId, 'Something went wrong saving that -- try again.');
    return;
  }

  const result = await saveVaultEntry(admin, { tgUserId: user.id, platformSlug, code });
  await sendMessage(chatId, result.ok ? result.confirmation : result.error);
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let update: TelegramUpdate;
  try {
    update = await req.json();
  } catch {
    return NextResponse.json({ ok: true }); // malformed body -- ack anyway, nothing to retry
  }

  const message = update.message;
  const chatId = message?.chat?.id;
  const text = message?.text?.trim();

  if (!chatId || !text) {
    return NextResponse.json({ ok: true });
  }

  try {
    if (text.startsWith('/start login_')) {
      await handleLoginStart(message!, text.slice('/start login_'.length).trim());
    } else if (text === '/start' || text === '/help') {
      await sendMessage(chatId, WELCOME_TEXT); // plain text -- WELCOME_TEXT uses <code>/<platform> as placeholder notation, which would conflict with an actual parse_mode
    } else if (/^\/save(@\w+)?(\s|$)/i.test(text)) {
      await handleSaveCommand(message!, text.split(/\s+/).slice(1));
    } else if (text.startsWith('/decode')) {
      const args = text.split(/\s+/).slice(1);
      await handleDecodeCommand(chatId, args);
    } else if (BOOKING_CODE_PATTERN.test(text)) {
      // Plain pasted code, no command -- assume SportyBet, the common case.
      await handleDecodeCommand(chatId, [text]);
    } else {
      await sendMessage(chatId, "I didn't understand that. Send /help, or just paste a SportyBet booking code.");
    }
  } catch (err) {
    console.error('[telegram webhook] handler error:', err);
    try {
      await sendMessage(chatId, 'Something went wrong on my end -- try again in a moment.');
    } catch {
      // If even the error message fails to send, there's nothing more to do here.
    }
  }

  // Always 200 quickly, regardless of outcome above -- a non-200 or a
  // slow response makes Telegram retry the same update, which would
  // double-send replies.
  return NextResponse.json({ ok: true });
}
