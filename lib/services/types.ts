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
  //
  // Two INDEPENDENT scores, shown side by side, never combined into one
  // number: `score` is our own Poisson model ("BetMeter Score" in the
  // UI); `tipsterScore` is the external prediction-site consensus
  // ("Tipster Score"), averaged across whatever sites matched (see
  // tipsterConsensus.ts). Either can be present without the other.
  score?: number | null;
  tipsterScore?: number | null;
  tipsterSources?: string[];

  // Raw platform-specific identifiers, needed to re-encode this selection
  // into a new booking code (the display-friendly `market` string alone
  // isn't enough). Optional/undefined for platforms or selections where
  // these aren't available or encode isn't supported.
  rawMarketId?: string;
  rawOutcomeId?: string;
  rawSportId?: string;
  rawSpecifier?: string; // e.g. "total=2.5" for Over/Under markets
}

export interface DecodeResult {
  status: DecodeStatus;
  shareCode: string | null;
  selections: NormalizedSelection[];
  totalOdds: number | null;
  raw: unknown;
}
