import { NextRequest, NextResponse } from 'next/server';
import { sendMessage, editMessage, answerCallbackQuery, type TelegramMessage, type TelegramUpdate } from '@/lib/services/telegram';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { getPlatform, PLATFORMS } from '@/lib/services/platforms';
import { saveVaultEntry } from '@/lib/services/vaultSave';
import {
  MAIN_MENU_TEXT,
  mainMenu,
  platformPicker,
  predictorAnalysis,
  predictorBands,
  predictorHome,
  predictorTicket,
  vaultSummary,
  websiteToolView,
} from '@/lib/telegram/menus';

export const runtime = 'nodejs';
export const maxDuration = 20;

const WELCOME_TEXT = `Welcome to BetMeter!

Tap a tool below, or use commands:
/menu -- show this menu
/decode <code> -- decode a SportyBet code (or /decode <platform> <code>)
/save -- pick a platform, then send your code to save it
/save <code> or /save <platform> <code> -- save in one go

You can also just paste a SportyBet booking code and I'll decode it. I'll message you here whenever a saved code settles.`;

const BOOKING_CODE_PATTERN = /^[A-Z0-9]{5,10}$/i;

function isAuthorized(req: NextRequest): boolean {
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!expected) return true; // not configured yet -- allow, but should be set before real launch
  return req.headers.get('x-telegram-bot-api-secret-token') === expected;
}

async function handleDecodeCommand(chatId: number, args: string[]) {
  if (args.length === 0) {
    await sendPlatformPrompt(chatId);
    return;
  }

  const platformSlug = args.length >= 2 ? args[0].toLowerCase() : 'sportybet';
  const code = args.length >= 2 ? args[1] : args[0];
  await decodeAndReply(chatId, platformSlug, code);
}

// Decode-only (no confidence scoring): scoring every leg is what made the
// website's decode take several seconds, which reads as broken in a chat.
async function decodeAndReply(chatId: number, platformSlug: string, code: string) {
  const platform = getPlatform(platformSlug);
  if (!platform) {
    await sendMessage(chatId, `I don't support "${platformSlug}" yet. Send /decode to pick from the platforms I can read.`);
    return;
  }

  const result = await platform.decode(code);
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

// A code prompt names the platform and the action, and Telegram sends it
// back as reply_to_message when the user answers -- that's how we know what
// the code is for without storing any conversation state.
const CODE_PROMPT_PATTERN = /^Send your (.+) booking code to (save|decode)\b/;

async function sendCodePrompt(chatId: number, slug: string, action: 'save' | 'decode') {
  const platform = getPlatform(slug);
  if (!platform) return;
  await sendMessage(chatId, `Send your ${platform.label} booking code to ${action} (reply to this message).`, undefined, {
    force_reply: true,
    input_field_placeholder: 'Booking code',
  });
}

async function sendPlatformPicker(chatId: number) {
  await sendMessage(chatId, 'Which platform is the code from?', undefined, platformPicker('save'));
}

async function sendPlatformPrompt(chatId: number) {
  await sendMessage(chatId, 'Which platform is the code from?', undefined, platformPicker('dec'));
}

// If this message is a reply to one of our code prompts, say which platform
// and action it was for.
function codePromptTarget(message: TelegramMessage): { slug: string; action: 'save' | 'decode' } | null {
  const m = message.reply_to_message?.text?.match(CODE_PROMPT_PATTERN);
  if (!m) return null;
  const slug = PLATFORMS.find((p) => p.label === m[1])?.slug;
  return slug ? { slug, action: m[2] as 'save' | 'decode' } : null;
}

// Button taps. The main menu and the Predictor list edit the tapped message
// in place; results (a ticket, an analysis, a decode) arrive as new messages.
async function handleCallback(query: NonNullable<TelegramUpdate['callback_query']>) {
  await answerCallbackQuery(query.id);
  const chat = query.message?.chat;
  const messageId = query.message?.message_id;
  const data = query.data ?? '';
  if (!chat || !messageId) return;
  const chatId = chat.id;
  const show = (text: string, keyboard: Record<string, unknown>) => editMessage(chatId, messageId, text, keyboard);

  const [route, a, b] = data.split(':');

  if (route === 'm') {
    if (a === 'home') return show(MAIN_MENU_TEXT, mainMenu());
    if (a === 'pred') {
      const v = predictorHome();
      return show(v.text, v.keyboard);
    }
    if (a === 'decode') return show('Which platform is the code from?', platformPicker('dec'));
    if (a === 'save') return show('Which platform is the code from?', platformPicker('save'));
    if (a === 'link') {
      const v = websiteToolView(b);
      if (v) return show(v.text, v.keyboard);
      return;
    }
    if (a === 'vault') {
      const v = await vaultSummary(getSupabaseAdmin(), query.from.id);
      return show(v.text, v.keyboard);
    }
    return;
  }

  if (route === 'pred') {
    const v = await predictorBands(getSupabaseAdmin(), a);
    return show(v.text, v.keyboard);
  }
  if (route === 'pt') {
    const v = await predictorTicket(getSupabaseAdmin(), a, b);
    return show(v.text, v.keyboard);
  }
  if (route === 'pa') {
    for (const chunk of await predictorAnalysis(getSupabaseAdmin(), a, b)) await sendMessage(chatId, chunk);
    return;
  }

  // Code prompts need the user's own DM -- a reply in a group wouldn't be
  // attributed or alerted correctly.
  if ((route === 'save' || route === 'dec') && chat.type === 'private' && getPlatform(a)) {
    return sendCodePrompt(chatId, a, route === 'save' ? 'save' : 'decode');
  }
}

// Saves a code for whoever sent the message. Telegram itself is the
// identity, so the first save from someone who never opened the website
// just creates their account row. Private chats only: alerts go to this
// chat, so it must be the user's own DM.
async function saveCodeForSender(message: TelegramMessage, platformSlug: string, code: string) {
  const chatId = message.chat.id;

  if (message.chat.type !== 'private' || !message.from) {
    await sendMessage(chatId, 'Message me directly to save codes to your Vault.');
    return;
  }
  if (!getPlatform(platformSlug)) {
    await sendMessage(chatId, `I don't support "${platformSlug}" yet. Send /save to see the platforms I can save.`);
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

// /save            -> platform buttons, then a prompt for the code
// /save <code>     -> SportyBet shortcut
// /save <platform> <code>
async function handleSaveCommand(message: TelegramMessage, args: string[]) {
  const chatId = message.chat.id;

  if (message.chat.type !== 'private' || !message.from) {
    await sendMessage(chatId, 'Message me directly to save codes to your Vault.');
    return;
  }
  if (args.length === 0) {
    await sendPlatformPicker(chatId);
    return;
  }
  if (args.length > 2) {
    await sendMessage(chatId, 'Send /save on its own and I\'ll walk you through it.');
    return;
  }

  const platformSlug = args.length === 2 ? args[0] : 'sportybet';
  const code = args.length === 2 ? args[1] : args[0];
  await saveCodeForSender(message, platformSlug, code);
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

  if (update.callback_query) {
    try {
      await handleCallback(update.callback_query);
    } catch (err) {
      console.error('[telegram webhook] callback error:', err);
    }
    return NextResponse.json({ ok: true });
  }

  const message = update.message;
  const chatId = message?.chat?.id;
  const text = message?.text?.trim();

  if (!chatId || !text) {
    return NextResponse.json({ ok: true });
  }

  try {
    const replyTarget = text.startsWith('/') ? null : codePromptTarget(message!);
    if (replyTarget) {
      if (replyTarget.action === 'save') await saveCodeForSender(message!, replyTarget.slug, text);
      else await decodeAndReply(chatId, replyTarget.slug, text);
    } else if (text.startsWith('/start login_')) {
      await handleLoginStart(message!, text.slice('/start login_'.length).trim());
    } else if (text === '/start' || text === '/help') {
      await sendMessage(chatId, WELCOME_TEXT, undefined, mainMenu()); // plain text -- WELCOME_TEXT uses <code>/<platform> as placeholder notation, which would conflict with an actual parse_mode
    } else if (/^\/menu(@\w+)?$/i.test(text)) {
      await sendMessage(chatId, MAIN_MENU_TEXT, undefined, mainMenu());
    } else if (/^\/save(@\w+)?(\s|$)/i.test(text)) {
      await handleSaveCommand(message!, text.split(/\s+/).slice(1));
    } else if (text.startsWith('/decode')) {
      const args = text.split(/\s+/).slice(1);
      await handleDecodeCommand(chatId, args);
    } else if (BOOKING_CODE_PATTERN.test(text)) {
      // Plain pasted code, no command -- assume SportyBet, the common case.
      await handleDecodeCommand(chatId, [text]);
    } else {
      await sendMessage(chatId, "I didn't understand that. Send /menu, or just paste a SportyBet booking code.");
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
