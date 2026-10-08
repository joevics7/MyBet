// Client-safe platform list (no server code). Keep slugs in sync with
// lib/services/platforms.ts, which holds the actual adapters.
export const PLATFORM_OPTIONS = [
  { slug: 'sportybet', label: 'SportyBet' },
  { slug: 'footballcom', label: 'Football.com' },
  { slug: 'msport', label: 'MSport' },
  { slug: 'betway', label: 'Betway' },
  { slug: 'bangbet', label: 'Bangbet' },
  { slug: 'stake', label: 'Stake (link or bet ID)' },
  { slug: 'bet9ja', label: 'Bet9ja' },
] as const;
