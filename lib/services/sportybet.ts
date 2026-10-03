// SportyBet Decode Service.
//
// Endpoint discovered by inspecting sportybet.com's own network traffic
// (not a documented API): GET /api/ng/orders/share/{code}. Confirmed
// working with a full logged-in session; not yet confirmed anonymous
// (see decode-service-notes.md once that's checked).
//
// The response conveniently already includes human-readable market/outcome
// descriptions ("1X2", "Draw") and, for finished matches, a per-leg
// isWinning flag -- so no private market-code dictionary is needed, and
// the Vault's result checker can re-poll this same endpoint instead of
// requiring a separate results feed for SportyBet specifically.

import type { DecodeStatus, NormalizedSelection, DecodeResult } from './types';

const SPORTYBET_BASE_URL = 'https://www.sportybet.com/api/ng/orders/share';

export type SportyBetDecodeStatus = DecodeStatus;
export type SportyBetDecodeResult = DecodeResult;
export type { NormalizedSelection };

// Raw shape of the fields we actually read from SportyBet's response.
// Deliberately loose (not exhaustive) -- the real payload has many more
// fields we don't need yet.
interface RawOutcomeOption {
  id: string;
  odds: string;
  desc: string;
  isWinning?: number;
}

interface RawMarket {
  id: string;
  desc: string;
  specifier?: string; // e.g. "total=2.5" for Over/Under -- needed to re-encode this market
  outcomes: RawOutcomeOption[];
}

interface RawEventOutcome {
  eventId: string;
  homeTeamName: string;
  awayTeamName: string;
  estimateStartTime: number;
  matchStatus: string;
  markets: RawMarket[];
}

interface RawSelection {
  eventId: string;
  marketId: string;
  outcomeId: string;
  sportId?: string;
}

interface RawShareResponse {
  bizCode: number;
  isAvailable: boolean;
  message: string;
  data?: {
    shareCode: string;
    ticket: {
      selections: RawSelection[];
      displayTotalOdds?: string;
    };
    outcomes: RawEventOutcome[];
  };
}

export interface EncodeSelectionInput {
  externalEventId: string; // SportyBet's eventId, e.g. "sr:match:74372516"
  marketId: string;
  outcomeId: string;
  specifier?: string; // e.g. "total=2.5" for Over/Under -- omit for markets without a line
}

export interface EncodeResult {
  status: 'ok' | 'failed';
  shareCode: string | null;
}

// CONFIRMED (2026-10-03) against a real captured Payload tab. Real
// request body for 5 selections:
//   {"selections":[{"eventId":"sr:match:73220780","marketId":"1",
//     "specifier":null,"outcomeId":"3"}, ...]}
// Confirms the earlier byte-count inference was right: none of
// parentBetBuilderMarketId/sportId/estimateStartTime (which the
// response echoes back) are sent by the client -- those are
// server-derived/enriched for the response only. The one correction
// from the original inferred version: specifier is always present as a
// key, explicitly null when there's no line -- not omitted.
export async function encodeSportyBetSlip(selections: EncodeSelectionInput[]): Promise<EncodeResult> {
  if (selections.length === 0) return { status: 'failed', shareCode: null };

  const body = {
    selections: selections.map((s) => ({
      eventId: s.externalEventId,
      marketId: s.marketId,
      specifier: s.specifier ?? null,
      outcomeId: s.outcomeId,
    })),
  };

  let res: Response;
  try {
    res = await fetch(SPORTYBET_BASE_URL, {
      method: 'POST',
      headers: {
        Accept: '*/*',
        'Content-Type': 'application/json;charset=UTF-8',
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Origin: 'https://www.sportybet.com',
        Referer: 'https://www.sportybet.com/ng/',
        clientid: 'web',
        platform: 'web',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(8000),
    });
  } catch (err) {
    console.error('[sportybet encode] fetch threw:', err);
    return { status: 'failed', shareCode: null };
  }

  const bodyText = await res.text();
  if (!res.ok) {
    console.error('[sportybet encode] non-OK response:', res.status, bodyText.slice(0, 500));
    return { status: 'failed', shareCode: null };
  }

  let json: RawShareResponse;
  try {
    json = JSON.parse(bodyText);
  } catch {
    console.error('[sportybet encode] response was not valid JSON:', bodyText.slice(0, 500));
    return { status: 'failed', shareCode: null };
  }

  if (json.bizCode !== 10000 || !json.data?.shareCode) {
    console.error('[sportybet encode] response did not include a shareCode:', JSON.stringify(json).slice(0, 500));
    return { status: 'failed', shareCode: null };
  }

  return { status: 'ok', shareCode: json.data.shareCode };
}

export async function decodeSportyBetCode(code: string): Promise<SportyBetDecodeResult> {
  const url = `${SPORTYBET_BASE_URL}/${encodeURIComponent(code)}?_t=${Date.now()}`;

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: '*/*',
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Referer: 'https://www.sportybet.com/ng/',
        clientid: 'web',
        platform: 'web',
      },
      // This is a live third-party endpoint, not ours -- don't let a hung
      // request hold a serverless function open indefinitely.
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    return { status: 'invalid', shareCode: null, selections: [], totalOdds: null, raw: null };
  }

  if (res.status === 404) {
    return { status: 'invalid', shareCode: null, selections: [], totalOdds: null, raw: null };
  }
  if (!res.ok) {
    return { status: 'invalid', shareCode: null, selections: [], totalOdds: null, raw: null };
  }

  const json = (await res.json()) as RawShareResponse;

  if (json.bizCode !== 10000 || !json.isAvailable || !json.data) {
    return { status: 'invalid', shareCode: null, selections: [], totalOdds: null, raw: json };
  }

  const { data } = json;
  const outcomesByEventId = new Map(data.outcomes.map((o) => [o.eventId, o]));

  const selections: NormalizedSelection[] = data.ticket.selections
    .map((sel) => {
      const event = outcomesByEventId.get(sel.eventId);
      if (!event) return null;

      const market = event.markets.find((m) => m.id === sel.marketId);
      const outcome = market?.outcomes.find((o) => o.id === sel.outcomeId);
      if (!market || !outcome) return null;

      const kickoffMs = event.estimateStartTime;
      const isLocked = Number.isFinite(kickoffMs) ? Date.now() >= kickoffMs : false;

      return {
        externalEventId: event.eventId,
        homeTeam: event.homeTeamName,
        awayTeam: event.awayTeamName,
        market: outcome.desc && outcome.desc !== market.desc
          ? `${market.desc} - ${outcome.desc}`
          : market.desc,
        odds: parseFloat(outcome.odds),
        kickoffAt: Number.isFinite(kickoffMs) ? new Date(kickoffMs).toISOString() : null,
        isLocked,
        matchStatus: event.matchStatus ?? null,
        isWinning: typeof outcome.isWinning === 'number' ? outcome.isWinning === 1 : null,
        rawMarketId: market.id,
        rawOutcomeId: outcome.id,
        rawSportId: sel.sportId ?? 'sr:sport:1', // football is the only sport decoded so far; fall back sensibly
        rawSpecifier: market.specifier,
      } as NormalizedSelection;
    })
    .filter((s): s is NormalizedSelection => s !== null);

  if (selections.length === 0) {
    return { status: 'invalid', shareCode: data.shareCode ?? null, selections: [], totalOdds: null, raw: json };
  }

  return {
    status: 'ok',
    shareCode: data.shareCode,
    selections,
    totalOdds: data.ticket.displayTotalOdds ? parseFloat(data.ticket.displayTotalOdds) : null,
    raw: json,
  };
}
