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
export async function sendMessage(chatId: number | string, text: string, parseMode?: 'Markdown' | 'HTML'): Promise<boolean> {
  const url = `${TELEGRAM_API_BASE}/bot${getBotToken()}/sendMessage`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      ...(parseMode ? { parse_mode: parseMode } : {}),
      disable_web_page_preview: true,
    }),
  });
  if (!res.ok) {
    console.error('[telegram] sendMessage failed:', res.status, await res.text());
  }
  return res.ok;
}

// Types for the subset of Telegram's Update object this bot reads.
// Not exhaustive -- Telegram's actual payload has many more fields.
export interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    chat: { id: number; type: string };
    from?: { id: number; first_name: string; username?: string };
    text?: string;
  };
}
