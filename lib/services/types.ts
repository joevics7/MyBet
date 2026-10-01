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
  // Populated by /api/decode after decoding (not by the platform-specific
  // decode services themselves, which don't know about the Confidence
  // Engine). Undefined on services' own return values; number | null once
  // the route has attempted scoring (null = not confidently scoreable,
  // see parseMarketString).
  score?: number | null;
}

export interface DecodeResult {
  status: DecodeStatus;
  shareCode: string | null;
  selections: NormalizedSelection[];
  totalOdds: number | null;
  raw: unknown;
}
