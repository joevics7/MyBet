// Client-safe platform list (no server code). Keep slugs in sync with
// lib/services/platforms.ts, which holds the actual adapters.
// Betpawa, 1xBet, 22bet and Bet9ja are hidden for now (2026-11-01): they don't work yet. Their adapters stay in
// lib/services/platforms.ts; add the lines back here to show them again.
export const PLATFORM_OPTIONS = [
  { slug: 'sportybet', label: 'SportyBet' },
  { slug: 'footballcom', label: 'Football.com' },
  { slug: 'msport', label: 'MSport' },
  { slug: 'betway', label: 'Betway' },
  { slug: 'bangbet', label: 'Bangbet' },
  { slug: 'betwinner', label: 'Betwinner' },
  { slug: 'helabet', label: 'Helabet' },
  { slug: 'paripesa', label: 'Paripesa' },
  { slug: 'melbet', label: 'Melbet' },
  { slug: 'afropari', label: 'Afropari' },
  { slug: 'stake', label: 'Stake (link or bet ID)' },
] as const;

// Platforms we can CREATE a new booking code on (the Converter's targets).
// Keep in sync with the adapters that define `encode` in lib/services/platforms.ts.
// MSport was rebuilt 2026-10-14 from a real capture (own adapter), but not yet run live.
export const CONVERT_TARGETS = [
  { slug: 'sportybet', label: 'SportyBet' },
  { slug: 'footballcom', label: 'Football.com' },
  { slug: 'betway', label: 'Betway' },
  { slug: 'msport', label: 'MSport' },
  // Added 2026-10-28 so each can be tested. Not confirmed live. The 1xBet-style sites only take
  // slips from each other; everything else says so per pick. Bet9ja and Stake have no create path.
  { slug: 'paripesa', label: 'Paripesa' },
  { slug: 'melbet', label: 'Melbet' },
  { slug: 'betwinner', label: 'Betwinner' },
  { slug: 'helabet', label: 'Helabet' },
  { slug: 'afropari', label: 'Afropari' },
  { slug: 'bangbet', label: 'Bangbet' },
] as const;
