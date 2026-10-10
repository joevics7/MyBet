// Minimal Telegram Bot API client -- just the calls the webhook needs.
// No SDK dependency; Telegram's HTTP API is simple enough that a wrapper
// adds more weight than value here.

const TELEGRAM_API_BASE = 'https://api.telegram.org';

function getBotToken(): string {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN is not set.');
  return token;
}

// parseMode omitted (the default) sends true plain text -- Telegram does
// no entity parsing at all, so it can't fail on special characters. Only
// pass 'Markdown'/'HTML' for text you fully control (static templates);
// never for text containing dynamic data (team names, user input, etc.)
// -- a stray underscore or asterisk in a team name would otherwise make
// the whole send fail with a 400 "can't parse entities" error.
export async function sendMessage(
  chatId: number | string,
  text: string,
  parseMode?: 'Markdown' | 'HTML',
  replyMarkup?: Record<string, unknown>, // inline_keyboard / force_reply
): Promise<boolean> {
  const url = `${TELEGRAM_API_BASE}/bot${getBotToken()}/sendMessage`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      ...(parseMode ? { parse_mode: parseMode } : {}),
      ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
      disable_web_page_preview: true,
    }),
  });
  if (!res.ok) {
    console.error('[telegram] sendMessage failed:', res.status, await res.text());
  }
  return res.ok;
}

// Swaps the text/buttons of a message in place (menu navigation without
// flooding the chat). Falls back to a fresh message if Telegram refuses the
// edit (message too old, identical content, etc).
export async function editMessage(
  chatId: number | string,
  messageId: number,
  text: string,
  replyMarkup?: Record<string, unknown>,
): Promise<void> {
  try {
    const res = await fetch(`${TELEGRAM_API_BASE}/bot${getBotToken()}/editMessageText`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        message_id: messageId,
        text,
        ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
        disable_web_page_preview: true,
      }),
    });
    if (res.ok) return;
    const body = await res.text();
    if (body.includes('message is not modified')) return;
    console.error('[telegram] editMessage failed, sending new message:', res.status, body);
  } catch (err) {
    console.error('[telegram] editMessage failed, sending new message:', err);
  }
  await sendMessage(chatId, text, undefined, replyMarkup);
}

// Stops the loading spinner on an inline button after it's tapped.
export async function answerCallbackQuery(callbackQueryId: string): Promise<void> {
  try {
    await fetch(`${TELEGRAM_API_BASE}/bot${getBotToken()}/answerCallbackQuery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ callback_query_id: callbackQueryId }),
    });
  } catch (err) {
    console.error('[telegram] answerCallbackQuery failed:', err);
  }
}

// Types for the subset of Telegram's Update object this bot reads.
// Not exhaustive -- Telegram's actual payload has many more fields.
export interface TelegramMessage {
  message_id: number;
  chat: { id: number; type: string };
  from?: { id: number; first_name: string; username?: string };
  text?: string;
  reply_to_message?: { text?: string };
}

export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  callback_query?: {
    id: string;
    from: { id: number; first_name: string; username?: string };
    data?: string;
    message?: TelegramMessage;
  };
}
