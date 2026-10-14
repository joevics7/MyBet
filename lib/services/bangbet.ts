// Bangbet adapter (decode + create code).
//
// Contract CONFIRMED from real browser captures (2026-10-14):
//
//  decode : POST https://bet-api.bangbet.com/api/bet/bookingV2   (form body: bookingCode=CODE)
//           -> { result: 1, data: { items: [ { eventId, marketId, marketName, outcomeId,
//                outcomeName, specifiers, odds, eventName, homeTeamName, awayTeamName,
//                active, scheduledTime (ALWAYS null here), ... } ] } }
//  odds   : POST https://bet-api.bangbet.com/api/bet/match/getMatchMarketRelateOdds
//           JSON { oddsRoomIdList: ["<producer>#<eventId>#<marketId>#<specifiers>"], sportId }
//           -> { data: [ { id, scheduledTime (epoch ms), matchStatus, homeTeamName, categoryId,
//                tournamentId, marketList: [ { markets: [ { id, specifiers, outcomes: [...] } ] } ] } ] }
//  create : POST https://bet-api.bangbet.com/api/bet/share
//           JSON { items: [ { sportId, eventId, producer, marketId, specifiers, outcomeId, amount: 0,
//                  odds, specifierKeys, eventName, scheduledTime, marketName, outcomeName,
//                  categoryId, tournamentId } ], betType: 1 }   -> { result: 1, data: "<code>" }
//
// Why scores used to be blank: the decode response has no kickoff time, and the Confidence
// Engine / tipster matching both need one. We now fill it from the odds endpoint.
//
// Bangbet uses Sportradar ids (same "sr:match:" ids and market/outcome ids as SportyBet:
// market 1 = 1X2 with outcomes 1/2/3, 18 = Over/Under, 29 = GG/NG), so market text is built
// from the ids first and from names only as a fallback.
//
// STILL UNVERIFIED: the odds-room-id format (third segment assumed to be the market id, as in
// the capture), the exact market/outcome names Bangbet uses for Over/Under and GG/NG, and the
// betType value for single-pick slips (the capture only shows betType 1 with three picks).

import type { DecodeResult, NormalizedSelection } from './types';
import type { EncodeResult, EncodeSelectionInput } from './sportybet';

const API = 'https://bet-api.bangbet.com/api/bet';
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36';
const BASE_HEADERS = {
  Accept: 'application/json, text/plain, */*',
  Origin: 'https://www.bangbet.com',
  Referer: 'https://www.bangbet.com/',
  'User-Agent': UA,
};

const EMPTY: DecodeResult = { status: 'invalid', shareCode: null, selections: [], totalOdds: null, raw: null };

type Json = Record<string, any>;

async function post(path: string, contentType: string, body: string): Promise<Json | null> {
  try {
    const res = await fetch(`${API}${path}`, {
      method: 'POST',
      headers: { ...BASE_HEADERS, 'Content-Type': contentType },
      body,
      signal: AbortSignal.timeout(8000),
    });
    const text = await res.text();
    if (!res.ok) {
      console.error(`[bangbet ${path}] non-OK:`, res.status, text.slice(0, 300));
      return null;
    }
    return JSON.parse(text) as Json;
  } catch (err) {
    console.error(`[bangbet ${path}] failed:`, err);
    return null;
  }
}

const postJson = (path: string, body: unknown) => post(path, 'application/json; charset=UTF-8', JSON.stringify(body));
const postForm = (path: string, form: Record<string, string>) =>
  post(path, 'application/x-www-form-urlencoded; charset=UTF-8', new URLSearchParams(form).toString());

// ---- helpers (exported for tests) ----------------------------------------------------------

// "total=2.5&" -> "2.5"
export function lineFromSpecifiers(spec: unknown): string | null {
  const m = String(spec ?? '').match(/total=(-?[\d.]+)/);
  return m ? m[1] : null;
}

// Bangbet writes specifiers as "total=2.5&"; other platforms use "total=2.5". Accept either.
export function toBangbetSpecifiers(spec: string | undefined | null): { specifiers: string; specifierKeys: string } {
  const parts = String(spec ?? '').split('&').map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0) return { specifiers: '', specifierKeys: '' };
  return {
    specifiers: parts.join('&') + '&',
    specifierKeys: parts.map((p) => p.split('=')[0]).join('&') + '&',
  };
}

// Builds the "market - outcome" text the shared parsers (parseMarketString) understand.
export function buildBangbetMarket(item: {
  marketId: string;
  marketName: string;
  outcomeId: string;
  outcomeName: string;
  specifiers: string;
  home: string;
  away: string;
}): string {
  const { marketId, marketName, outcomeId, outcomeName, specifiers, home, away } = item;
  const out = outcomeName.trim();
  const outLower = out.toLowerCase();
  const line = lineFromSpecifiers(specifiers);

  // 1X2: outcome ids are fixed (1 home, 2 draw, 3 away); fall back to matching names.
  if (marketId === '1') {
    const side =
      outcomeId === '1' ? 'Home' : outcomeId === '2' ? 'Draw' : outcomeId === '3' ? 'Away'
      : /draw/i.test(out) ? 'Draw'
      : outLower === home.toLowerCase() ? 'Home'
      : outLower === away.toLowerCase() ? 'Away' : null;
    if (side) return `1X2 - ${side}`;
  }

  // Over/Under (total goals): outcome ids 12 = over, 13 = under; line comes from the specifier.
  const isTotal =
    marketId === '18' ||
    (/^(over\/under|total|o\/u)/i.test(marketName.trim()) && !/(home|away|team|half|corner|card)/i.test(marketName));
  if (isTotal && line) {
    const side = outcomeId === '12' || /^over/i.test(out) ? 'Over' : outcomeId === '13' || /^under/i.test(out) ? 'Under' : null;
    if (side) return `Total Goals - ${side} ${line}`;
  }

  // GG/NG (both teams to score): outcome ids 74 = yes, 76 = no.
  const isBtts = marketId === '29' || /(gg\/ng|both teams to score|btts)/i.test(marketName);
  if (isBtts) {
    const side = outcomeId === '74' || /^(yes|gg)/i.test(out) ? 'Yes' : outcomeId === '76' || /^(no|ng)/i.test(out) ? 'No' : null;
    if (side) return `GG/NG - ${side}`;
  }

  // Everything else keeps Bangbet's own wording (and the line, so it isn't lost).
  const base = [marketName, line ? `(${line})` : ''].filter(Boolean).join(' ');
  return `${base} - ${out}`.trim();
}

function toIso(v: unknown): string | null {
  const n = typeof v === 'string' ? Number(v) : (v as number);
  if (typeof n === 'number' && Number.isFinite(n) && n > 0) return new Date(n < 1e12 ? n * 1000 : n).toISOString();
  return null;
}

const roomId = (producer: unknown, eventId: string, marketId: string, specifiers: string) =>
  `${producer ?? 1}#${eventId}#${marketId}#${specifiers}`;

// One call covers every leg. Returns eventId -> event record (kickoff, status, ids, markets).
async function lookupEvents(
  legs: { eventId: string; marketId: string; specifiers: string; producer?: unknown; sportId?: string }[],
): Promise<Map<string, Json>> {
  const out = new Map<string, Json>();
  if (legs.length === 0) return out;
  const json = await postJson('/match/getMatchMarketRelateOdds', {
    oddsRoomIdList: legs.map((l) => roomId(l.producer, l.eventId, l.marketId, l.specifiers)),
    sportId: legs[0].sportId ?? 'sr:sport:1',
  });
  if (!json || json.result !== 1 || !Array.isArray(json.data)) return out;
  for (const ev of json.data as Json[]) if (ev?.id) out.set(String(ev.id), ev);
  return out;
}

// ---- decode ------------------------------------------------------------------------------------

export async function decodeBangbetCode(code: string): Promise<DecodeResult> {
  const clean = code.trim();
  const json = await postForm('/bookingV2', { bookingCode: clean });

  if (!json || json.result !== 1 || !Array.isArray(json.data?.items)) {
    if (json) console.error('[bangbet decode] unexpected:', JSON.stringify(json).slice(0, 300));
    return { ...EMPTY, raw: json };
  }
  const items: Json[] = json.data.items;
  if (items.length === 0) return { ...EMPTY, status: 'expired', raw: json };

  // Kickoff time and live status are not in the decode response -- fetch them in one call.
  const events = await lookupEvents(
    items.map((i) => ({
      eventId: String(i.eventId),
      marketId: String(i.marketId),
      specifiers: String(i.specifiers ?? ''),
      producer: i.producer,
      sportId: i.sportId,
    })),
  );

  const now = Date.now();
  const selections: NormalizedSelection[] = [];
  for (const i of items) {
    const odds = Number(i.odds);
    const eventId = String(i.eventId ?? '');
    const ev = events.get(eventId);
    const [nameHome, nameAway] = String(i.eventName ?? '').split(/\s+(?:vs\.?|v)\s+/i);
    const home = String(i.homeTeamName ?? ev?.homeTeamName ?? nameHome ?? '').trim();
    const away = String(i.awayTeamName ?? ev?.awayTeamName ?? nameAway ?? '').trim();
    if (!home || !away || !Number.isFinite(odds)) continue;

    const kickoff = toIso(i.scheduledTime) ?? toIso(ev?.scheduledTime);
    const specifiers = String(i.specifiers ?? '');
    const status = String(ev?.matchStatus ?? '').toLowerCase();
    const started =
      (kickoff ? now >= Date.parse(kickoff) : false) || status === 'live' || status === 'ended' || status === 'closed';

    selections.push({
      externalEventId: eventId || `${home}-${away}`,
      homeTeam: home,
      awayTeam: away,
      market: buildBangbetMarket({
        marketId: String(i.marketId ?? ''),
        marketName: String(i.marketName ?? ''),
        outcomeId: String(i.outcomeId ?? ''),
        outcomeName: String(i.outcomeName ?? ''),
        specifiers,
        home,
        away,
      }),
      odds,
      kickoffAt: kickoff,
      isLocked: i.active === false || started,
      matchStatus: status || null,
      isWinning: null,
      rawMarketId: String(i.marketId ?? ''),
      rawOutcomeId: String(i.outcomeId ?? ''),
      rawSportId: String(i.sportId ?? 'sr:sport:1'),
      rawSpecifier: specifiers || undefined,
    });
  }
  if (selections.length === 0) return { ...EMPTY, raw: json };

  const total = selections.reduce((a, s) => a * s.odds, 1);
  return { status: 'ok', shareCode: clean, selections, totalOdds: Math.round(total * 100) / 100, raw: json };
}

// ---- create code ---------------------------------------------------------------------------------

// Bangbet wants the full descriptive item (names, kickoff, category ids, current odds), not just
// ids, so each pick is looked up first and the current price is taken from Bangbet itself.
export async function encodeBangbetSlip(selections: EncodeSelectionInput[]): Promise<EncodeResult> {
  if (selections.length === 0) return { status: 'failed', shareCode: null };

  const ids = selections.map((s) => s.externalEventId);
  if (new Set(ids).size !== ids.length) {
    console.error('[bangbet encode] two picks from the same event');
    return { status: 'failed', shareCode: null };
  }
  if (ids.some((id) => !id.startsWith('sr:match:'))) return { status: 'failed', shareCode: null };

  const prepared = selections.map((s) => ({ s, spec: toBangbetSpecifiers(s.specifier) }));
  const events = await lookupEvents(
    prepared.map(({ s, spec }) => ({ eventId: s.externalEventId, marketId: s.marketId, specifiers: spec.specifiers })),
  );

  const items: Json[] = [];
  for (const { s, spec } of prepared) {
    const ev = events.get(s.externalEventId);
    const markets: Json[] = (ev?.marketList ?? []).flatMap((g: Json) => g.markets ?? []);
    const market = markets.find((m) => String(m.id) === s.marketId && String(m.specifiers ?? '') === spec.specifiers);
    const outcome = (market?.outcomes ?? []).find((o: Json) => String(o.id) === s.outcomeId);
    if (!ev || !market || !outcome || market.active === false || outcome.active === false) {
      console.error('[bangbet encode] pick not available:', s.externalEventId, s.marketId, s.outcomeId);
      return { status: 'failed', shareCode: null };
    }
    items.push({
      sportId: ev.sportId ?? 'sr:sport:1',
      eventId: s.externalEventId,
      producer: ev.producer ?? 1,
      marketId: s.marketId,
      specifiers: spec.specifiers,
      outcomeId: s.outcomeId,
      amount: 0,
      odds: Number(outcome.odds),
      specifierKeys: spec.specifierKeys,
      eventName: ev.name ?? `${ev.homeTeamName} vs. ${ev.awayTeamName}`,
      scheduledTime: ev.scheduledTime,
      marketName: market.name,
      outcomeName: outcome.desc,
      categoryId: ev.categoryId,
      tournamentId: ev.tournamentId,
    });
  }

  const json = await postJson('/share', { items, betType: 1 });
  if (!json || json.result !== 1 || typeof json.data !== 'string' || !json.data) {
    console.error('[bangbet encode] failed:', JSON.stringify(json)?.slice(0, 300));
    return { status: 'failed', shareCode: null };
  }
  return { status: 'ok', shareCode: json.data };
}
