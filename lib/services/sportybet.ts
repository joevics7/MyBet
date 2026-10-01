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
  sportId: string; // e.g. "sr:sport:1"
}

export interface EncodeResult {
  status: 'ok' | 'failed';
  shareCode: string | null;
}

// STUB -- not yet implemented. We only ever captured the RESPONSE of
// POST /api/ng/orders/share (used to create a new booking code), not its
// request payload, so the actual shape to send is still unknown. The
// response we did capture showed ticket.selections with fields
// {eventId, marketId, outcomeId, parentBetBuilderMarketId, sportId,
// estimateStartTime} -- but that's the response's echo of what was
// created, not confirmed proof of the request body's required shape
// (e.g. whether estimateStartTime must be sent by the client, or is
// looked up server-side from eventId). Needs a real Payload-tab capture
// before this can be written for real. Splitter calls this and handles
// 'failed' gracefully (shows the grouped selections without a generated
// code) rather than being blocked on it.
export async function encodeSportyBetSlip(_selections: EncodeSelectionInput[]): Promise<EncodeResult> {
  console.error('[sportybet encode] not yet implemented -- need the real request payload captured');
  return { status: 'failed', shareCode: null };
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
