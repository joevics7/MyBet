// Shared types for the Odds Comparison board.

export type MarketKey = '1x2' | 'ou1.5' | 'ou2.5' | 'ou3.5' | 'btts';

export const MARKETS: { key: MarketKey; title: string; outcomes: string[] }[] = [
  { key: '1x2', title: 'Match result', outcomes: ['1', 'X', '2'] },
  { key: 'ou2.5', title: 'Over/Under 2.5', outcomes: ['Over', 'Under'] },
  { key: 'ou1.5', title: 'Over/Under 1.5', outcomes: ['Over', 'Under'] },
  { key: 'ou3.5', title: 'Over/Under 3.5', outcomes: ['Over', 'Under'] },
  { key: 'btts', title: 'Both teams to score', outcomes: ['Yes', 'No'] },
];

export type Prices = (number | null)[];
export type OddsByMarket = Partial<Record<MarketKey, Prices>>;

// One match as reported by one direct source (one platform).
export interface FeedMatch {
  srId: string | null; // Sportradar id, e.g. "sr:match:123" -- exact join key when present
  home: string;
  away: string;
  kickoff: string; // ISO
  league: string;
  country: string;
  odds: OddsByMarket;
}

// One match as reported by the aggregator: many bookmakers at once.
export interface AggregatorMatch extends Omit<FeedMatch, 'odds'> {
  books: Record<string, { label: string; odds: OddsByMarket }>;
}

export interface PlatformOdds {
  slug: string;
  label: string;
  via: 'direct' | 'aggregator'; // where the main numbers came from
  odds: OddsByMarket;
}

export interface DayMatch {
  id: string;
  home: string;
  away: string;
  kickoff: string;
  league: string;
  country: string;
  platforms: PlatformOdds[]; // already in display order
}

export interface SourceStatus {
  slug: string;
  label: string;
  role: 'main' | 'direct' | 'fallback';
  ok: boolean;
  matches: number;
  note?: string;
}

export interface DayOdds {
  from: string;
  to: string;
  generatedAt: string;
  matches: DayMatch[];
  sources: SourceStatus[];
}

export const num = (v: unknown): number | null => {
  const n = typeof v === 'string' ? Number(v) : (v as number);
  return typeof n === 'number' && Number.isFinite(n) && n > 1 ? n : null;
};

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
