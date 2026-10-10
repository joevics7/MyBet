// Persistent menu keyboard. Kept dependency-free so the Telegram client
// (lib/services/telegram.ts) can attach it to every private-chat message.

// The persistent keyboard under the message box (the grid icon in Telegram
// toggles it). Each button just sends its own label as a message, so the
// webhook matches on these exact strings.
export const MENU_BUTTONS = {
  predictor: '\uD83D\uDD2E Predictor',
  decode: '\uD83D\uDD13 Decode',
  save: '\uD83D\uDCBE Save code',
  vault: '\uD83D\uDCC2 My Vault',
  split: '\u2702\uFE0F Splitter',
  convert: '\uD83D\uDD01 Converter',
  stake: '\uD83D\uDCB0 Stake calculator',
  odds: '\uD83D\uDCCA Odds comparison',
} as const;

export type MenuAction = keyof typeof MENU_BUTTONS;

export function menuActionFor(text: string): MenuAction | null {
  return (Object.keys(MENU_BUTTONS) as MenuAction[]).find((k) => MENU_BUTTONS[k] === text) ?? null;
}

export function replyKeyboard() {
  const b = MENU_BUTTONS;
  return {
    keyboard: [
      [{ text: b.predictor }, { text: b.decode }],
      [{ text: b.save }, { text: b.vault }],
      [{ text: b.split }, { text: b.convert }],
      [{ text: b.stake }, { text: b.odds }],
    ],
    resize_keyboard: true,
    is_persistent: true,
    input_field_placeholder: 'Paste a booking code or tap a tool',
  };
}
