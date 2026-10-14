// Telegram bot menus: the main tool menu plus the Predictor browser.
//
// Navigation uses inline buttons whose callback_data is a short route:
//   m:home | m:pred | m:decode | m:save | m:vault | m:link:<tool>
//   pred:<basis>            -> bands for that set
//   pt:<basis>:<band>       -> one ticket
//   pa:<basis>:<band>       -> that ticket's written analysis
//   dec:<platformSlug>      -> prompt for a code to decode
// (save:<slug> predates this file and is handled in the webhook.)
// Everything is read from stored data; no menu tap triggers upstream fetching.

import type { SupabaseClient } from '@supabase/supabase-js';
import { PLATFORMS } from '@/lib/services/platforms';

type Button = { text: string; callback_data: string } | { text: string; url: string };
export type Keyboard = { inline_keyboard: Button[][] };

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://betmeter.com').replace(/\/$/, '');

// Only platforms that decode correctly are offered. Tested 2026-10-10:
// Stake and Bet9ja don't work; MSport was rebuilt 2026-10-14 and is offered again (Stake also takes a share link, not a
// booking code). Typing the platform by hand still works for them.
const PICKER_EXCLUDED = new Set(['stake', 'bet9ja', 'betpawa']); // betpawa: decode layout not mapped yet
export const PICKER_PLATFORMS = PLATFORMS.filter((p) => !PICKER_EXCLUDED.has(p.slug));

// Tools that need more time than a chat reply allows (they score every
// leg or call several feeds) open on the website instead.
export const WEBSITE_TOOLS: Record<string, { label: string; path: string; blurb: string }> = {
  split: { label: 'Splitter', path: '/tools/splitter', blurb: 'Split a big slip into smaller tickets by risk, evenly, or by market.' },
  convert: { label: 'Converter', path: '/tools/converter', blurb: 'Convert a booking code from one platform to another.' },
  stake: { label: 'Stake calculator', path: '/tools/stake-calculator', blurb: 'Confidence-driven fractional Kelly stake sizing.' },
  odds: { label: 'Odds comparison', path: '/tools/odds-comparison', blurb: "Compare today's odds across platforms." },
};

export const MAIN_MENU_TEXT = 'BetMeter tools -- what do you want to do?';

export function mainMenu(): Keyboard {
  return {
    inline_keyboard: [
      [{ text: '\uD83D\uDD2E Daily Predictor', callback_data: 'm:pred' }],
      [
        { text: '\uD83D\uDD13 Decode a code', callback_data: 'm:decode' },
        { text: '\uD83D\uDCBE Save to Vault', callback_data: 'm:save' },
      ],
      [{ text: '\uD83D\uDCC2 My Vault', callback_data: 'm:vault' }],
      [
        { text: '\u2702\uFE0F Splitter', callback_data: 'm:link:split' },
        { text: '\uD83D\uDD01 Converter', callback_data: 'm:link:convert' },
      ],
      [
        { text: '\uD83D\uDCB0 Stake calculator', callback_data: 'm:link:stake' },
        { text: '\uD83D\uDCCA Odds comparison', callback_data: 'm:link:odds' },
      ],
    ],
  };
}

export { MENU_BUTTONS, menuActionFor, replyKeyboard, type MenuAction } from './keyboard';

const HOME_ROW: Button[] = [{ text: '\uD83C\uDFE0 Menu', callback_data: 'm:home' }];

export function platformPicker(prefix: 'save' | 'dec'): Keyboard {
  const buttons: Button[] = PICKER_PLATFORMS.map((p) => ({ text: p.label, callback_data: `${prefix}:${p.slug}` }));
  const rows: Button[][] = [];
  for (let i = 0; i < buttons.length; i += 2) rows.push(buttons.slice(i, i + 2));
  rows.push(HOME_ROW);
  return { inline_keyboard: rows };
}

export function websiteToolView(tool: string): { text: string; keyboard: Keyboard } | null {
  const t = WEBSITE_TOOLS[tool];
  if (!t) return null;
  return {
    text: `${t.label}: ${t.blurb}\n\nThis one runs on the website.`,
    keyboard: { inline_keyboard: [[{ text: `Open ${t.label}`, url: `${SITE_URL}${t.path}` }], HOME_ROW] },
  };
}

// ---------------------------------------------------------------- Predictor

export type Basis = 'bookmaker' | 'model';
const BASIS_LABEL: Record<Basis, string> = { bookmaker: 'Bookmaker odds', model: 'Model odds' };
const isBasis = (v: string): v is Basis => v === 'bookmaker' || v === 'model';

const today = () => new Date().toISOString().slice(0, 10);

export function predictorHome(): { text: string; keyboard: Keyboard } {
  return {
    text:
      "Daily AI Predictor\n\nBookmaker odds: today's SportyBet games at their real prices.\nModel odds: a wider set of games priced by our model.\n\nWhich set?",
    keyboard: {
      inline_keyboard: [
        [
          { text: 'Bookmaker odds', callback_data: 'pred:bookmaker' },
          { text: 'Model odds', callback_data: 'pred:model' },
        ],
        HOME_ROW,
      ],
    },
  };
}

export async function predictorBands(admin: SupabaseClient, basis: string): Promise<{ text: string; keyboard: Keyboard }> {
  if (!isBasis(basis)) return predictorHome();
  const { data: tickets, error } = await admin
    .from('predictor_tickets')
    .select('target_band, combined_odds, avg_confidence')
    .eq('ticket_date', today())
    .eq('odds_basis', basis)
    .order('target_band', { ascending: true });

  const back: Button[] = [{ text: '\u2B05 Sets', callback_data: 'm:pred' }, ...HOME_ROW];
  if (error) {
    console.error('[menus] predictor bands failed:', error);
    return { text: "Couldn't load today's tickets -- try again in a moment.", keyboard: { inline_keyboard: [back] } };
  }
  if (!tickets || tickets.length === 0) {
    return {
      text: `${BASIS_LABEL[basis]}: no tickets published yet today.\n\nThe Predictor runs each morning, and a light fixture day may publish fewer tickets.`,
      keyboard: { inline_keyboard: [back] },
    };
  }
  const rows: Button[][] = tickets.map((t) => [
    {
      text: `${t.target_band}x band  \u00B7  ${Number(t.combined_odds).toFixed(2)} odds  \u00B7  ${Math.round(Number(t.avg_confidence))}% conf`,
      callback_data: `pt:${basis}:${t.target_band}`,
    },
  ]);
  rows.push(back);
  return { text: `${BASIS_LABEL[basis]} -- pick a ticket:`, keyboard: { inline_keyboard: rows } };
}

interface TicketRow {
  id: string;
  target_band: number;
  combined_odds: number;
  avg_confidence: number;
  booking_codes: { label: string; code: string; totalOdds: number | null }[] | null;
}
interface SelRow {
  home_team: string;
  away_team: string;
  market: string;
  score: number;
  model_odds: number;
  book_odds: number | null;
  reason: string | null;
  kickoff_at: string | null;
}

async function loadTicket(admin: SupabaseClient, basis: string, band: string) {
  if (!isBasis(basis)) return null;
  const { data: ticket } = await admin
    .from('predictor_tickets')
    .select('id, target_band, combined_odds, avg_confidence, booking_codes')
    .eq('ticket_date', today())
    .eq('odds_basis', basis)
    .eq('target_band', Number(band))
    .maybeSingle();
  if (!ticket) return null;
  const { data: sels } = await admin
    .from('predictor_ticket_selections')
    .select('home_team, away_team, market, score, model_odds, book_odds, reason, kickoff_at')
    .eq('ticket_id', (ticket as TicketRow).id)
    .order('kickoff_at', { ascending: true });
  return { ticket: ticket as TicketRow, selections: (sels ?? []) as SelRow[], basis };
}

function kickoff(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return ` (${d.toISOString().slice(11, 16)} UTC)`;
}

export async function predictorTicket(admin: SupabaseClient, basis: string, band: string): Promise<{ text: string; keyboard: Keyboard }> {
  const back: Button[] = [{ text: '\u2B05 Tickets', callback_data: `pred:${basis}` }, ...HOME_ROW];
  const loaded = await loadTicket(admin, basis, band);
  if (!loaded) {
    return { text: "That ticket isn't available anymore -- the Predictor may have refreshed.", keyboard: { inline_keyboard: [back] } };
  }
  const { ticket, selections } = loaded;
  const lines = selections.map((s, i) => {
    const odds = s.book_odds ?? s.model_odds;
    return `${i + 1}. ${s.home_team} v ${s.away_team}${kickoff(s.kickoff_at)}\n   ${s.market} @ ${Number(odds).toFixed(2)}  \u00B7  ${Math.round(s.score)}% conf`;
  });
  const codes = (ticket.booking_codes ?? []).map(
    (c) => `${c.label}: ${c.code}${c.totalOdds ? ` (odds ${Number(c.totalOdds).toFixed(2)})` : ''}`,
  );
  const text = [
    `${BASIS_LABEL[basis as Basis]} \u00B7 ${ticket.target_band}x band`,
    `Combined odds ${Number(ticket.combined_odds).toFixed(2)} \u00B7 avg confidence ${Math.round(Number(ticket.avg_confidence))}%`,
    '',
    lines.join('\n\n'),
    '',
    codes.length ? `Booking codes:\n${codes.join('\n')}` : 'No booking code was created for this ticket.',
    '',
    'Statistical analysis, not a guarantee.',
  ].join('\n');
  return {
    text,
    keyboard: { inline_keyboard: [[{ text: '\uD83D\uDCDD Analysis', callback_data: `pa:${basis}:${band}` }], back] },
  };
}

// Telegram messages cap at 4096 chars; split the analysis on pick boundaries.
export async function predictorAnalysis(admin: SupabaseClient, basis: string, band: string): Promise<string[]> {
  const loaded = await loadTicket(admin, basis, band);
  if (!loaded) return ["That ticket isn't available anymore."];
  const blocks = loaded.selections.map(
    (s) => `${s.home_team} v ${s.away_team} -- ${s.market}\n${s.reason?.trim() || 'No written analysis for this pick.'}`,
  );
  const chunks: string[] = [];
  let cur = '';
  for (const b of blocks) {
    if (cur && cur.length + b.length + 2 > 3800) {
      chunks.push(cur);
      cur = '';
    }
    cur += (cur ? '\n\n' : '') + b.slice(0, 3800);
  }
  if (cur) chunks.push(cur);
  return chunks.length ? chunks : ['No written analysis for this ticket.'];
}

// ----------------------------------------------------------------- My Vault

const STATUS_ICON: Record<string, string> = { pending: '\u23F3', won: '\u2705', lost: '\u274C', void: '\u26AA', unable_to_check: '\u2754' };

export async function vaultSummary(admin: SupabaseClient, telegramId: number): Promise<{ text: string; keyboard: Keyboard }> {
  const kb: Keyboard = {
    inline_keyboard: [[{ text: '\uD83D\uDCBE Save a code', callback_data: 'm:save' }, ...HOME_ROW]],
  };
  const { data: user } = await admin.from('telegram_users').select('id').eq('telegram_id', telegramId).maybeSingle();
  if (!user) return { text: 'Your Vault is empty. Save a code and I\'ll message you when it settles.', keyboard: kb };

  const { data: entries, error } = await admin
    .from('vault_entries')
    .select('code, status, legs_total, legs_correct, platforms(name)')
    .eq('tg_user_id', user.id)
    .order('saved_at', { ascending: false })
    .limit(10);
  if (error) {
    console.error('[menus] vault list failed:', error);
    return { text: "Couldn't load your Vault -- try again in a moment.", keyboard: kb };
  }
  if (!entries || entries.length === 0) {
    return { text: 'Your Vault is empty. Save a code and I\'ll message you when it settles.', keyboard: kb };
  }
  const lines = (entries as unknown as { code: string; status: string; legs_total: number; legs_correct: number | null; platforms: { name: string } | { name: string }[] | null }[]).map((e) => {
    const plat = Array.isArray(e.platforms) ? e.platforms[0]?.name : e.platforms?.name;
    const legs = e.status === 'pending' || e.status === 'unable_to_check' ? `${e.legs_total} legs` : `${e.legs_correct ?? 0}/${e.legs_total} legs`;
    return `${STATUS_ICON[e.status] ?? '\u2754'} ${plat ?? 'Unknown'} ${e.code} -- ${legs}`;
  });
  return { text: `Your latest ${entries.length} saved codes:\n\n${lines.join('\n')}\n\n\u23F3 pending  \u2705 won  \u274C lost  \u2754 can't auto-check`, keyboard: kb };
}

