import { NextRequest, NextResponse } from 'next/server';
import { sendMessage, type TelegramUpdate } from '@/lib/services/telegram';
import { decodeSportyBetCode } from '@/lib/services/sportybet';
import { decodeBet9jaCode } from '@/lib/services/bet9ja';
import type { DecodeResult } from '@/lib/services/types';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

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
/link <code> -- links this chat to your BetMeter account, so Vault notifications land here (get a code from the website's Vault page)

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

async function handleLinkCommand(chatId: number, args: string[]) {
  const code = args[0]?.toUpperCase();
  if (!code) {
    await sendMessage(chatId, "Send it like this: /link ABC123 (get a code from the website's Vault page).");
    return;
  }

  let admin;
  try {
    admin = getSupabaseAdmin();
  } catch {
    await sendMessage(chatId, "Linking isn't available right now -- try again later.");
    return;
  }

  const { data: linkRow } = await admin
    .from('telegram_link_codes')
    .select('user_id, expires_at')
    .eq('code', code)
    .maybeSingle();

  if (!linkRow || new Date(linkRow.expires_at).getTime() < Date.now()) {
    await sendMessage(chatId, "That code is invalid or expired -- generate a new one on the website's Vault page.");
    return;
  }

  // One link code is single-use -- delete it before anything else, so a
  // retry or race can't link it twice.
  await admin.from('telegram_link_codes').delete().eq('code', code);

  const { error } = await admin
    .from('user_settings')
    .upsert({ user_id: linkRow.user_id, telegram_chat_id: String(chatId) }, { onConflict: 'user_id' });

  if (error) {
    console.error('[telegram webhook] link upsert failed:', error);
    await sendMessage(chatId, 'Something went wrong linking your account -- try again.');
    return;
  }

  await sendMessage(chatId, "Linked! I'll notify you here when your saved Vault codes settle.");
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
    if (text === '/start' || text === '/help') {
      await sendMessage(chatId, WELCOME_TEXT); // plain text -- WELCOME_TEXT uses <code>/<platform> as placeholder notation, which would conflict with an actual parse_mode
    } else if (text.startsWith('/decode')) {
      const args = text.split(/\s+/).slice(1);
      await handleDecodeCommand(chatId, args);
    } else if (text.startsWith('/link')) {
      const args = text.split(/\s+/).slice(1);
      await handleLinkCommand(chatId, args);
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
