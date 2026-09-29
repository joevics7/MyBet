// Shared shape every platform's Decode Service normalizes into, so the
// API route and UI don't need to know which platform produced a result.

export type DecodeStatus = 'ok' | 'invalid' | 'expired' | 'unsupported_platform';

export interface NormalizedSelection {
  externalEventId: string;
  homeTeam: string;
  awayTeam: string;
  market: string;
  odds: number;
  kickoffAt: string | null;
  isLocked: boolean;
  matchStatus: string | null;
  isWinning: boolean | null;
}

export interface DecodeResult {
  status: DecodeStatus;
  shareCode: string | null;
  selections: NormalizedSelection[];
  totalOdds: number | null;
  raw: unknown;
}
