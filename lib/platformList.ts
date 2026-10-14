// Client-safe platform list (no server code). Keep slugs in sync with
// lib/services/platforms.ts, which holds the actual adapters.
export const PLATFORM_OPTIONS = [
  { slug: 'sportybet', label: 'SportyBet' },
  { slug: 'footballcom', label: 'Football.com' },
  { slug: 'msport', label: 'MSport' },
  { slug: 'betway', label: 'Betway' },
  { slug: 'bangbet', label: 'Bangbet' },
  { slug: 'betpawa', label: 'Betpawa' },
  { slug: '1xbet', label: '1xBet' },
  { slug: 'betwinner', label: 'Betwinner' },
  { slug: 'helabet', label: 'Helabet' },
  { slug: 'paripesa', label: 'Paripesa' },
  { slug: 'melbet', label: 'Melbet' },
  { slug: 'afropari', label: 'Afropari' },
  { slug: '22bet', label: '22bet' },
  { slug: 'stake', label: 'Stake (link or bet ID)' },
  { slug: 'bet9ja', label: 'Bet9ja' },
] as const;

// Platforms we can CREATE a new booking code on (the Converter's targets).
// Keep in sync with the adapters that define `encode` in lib/services/platforms.ts.
// MSport was rebuilt 2026-10-14 from a real capture (own adapter), but not yet run live.
export const CONVERT_TARGETS = [
  { slug: 'sportybet', label: 'SportyBet' },
  { slug: 'footballcom', label: 'Football.com' },
  { slug: 'betway', label: 'Betway' },
  { slug: 'msport', label: 'MSport' },
] as const;
