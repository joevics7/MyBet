export interface ToolEntry {
  slug: string;
  title: string;
  shortTitle: string;
  tagline: string;
  href: string;
  status: 'live' | 'soon';
  isBonus?: boolean;
}

// The 6 core tools + 1 bonus tool from the product spec. Static for now —
// there's a fixed, small set of these, so no need for a Supabase-backed
// catalog the way a growing content site would need one.
export const TOOLS_CATALOG: ToolEntry[] = [
  {
    slug: 'decoder',
    title: 'Booking Code Decoder + Confidence Score',
    shortTitle: 'Decoder',
    tagline: 'Paste a code, see every selection scored for risk before you commit.',
    href: '/tools/decoder',
    status: 'live',
  },
  {
    slug: 'converter',
    title: 'Booking Code Converter + Smart Filter',
    shortTitle: 'Converter',
    tagline: 'Move a slip from one platform to another without losing selections.',
    href: '/tools/converter',
    status: 'soon',
  },
  {
    slug: 'splitter',
    title: 'Bet Splitter by Risk',
    shortTitle: 'Splitter',
    tagline: 'Break a big ticket into risk-tiered slips, automatically or by hand.',
    href: '/tools/splitter',
    status: 'live',
  },
  {
    slug: 'odds-comparison',
    title: 'Odds Comparison',
    shortTitle: 'Odds Compare',
    tagline: 'Check 2-4 platforms for a better price on the games you actually have.',
    href: '/tools/odds-comparison',
    status: 'soon',
  },
  {
    slug: 'vault',
    title: 'Bet Code Vault + Auto Result Checker',
    shortTitle: 'Vault',
    tagline: 'Save a code once — get a plain-language result when every leg settles.',
    href: '/tools/vault',
    status: 'soon',
  },
  {
    slug: 'stake-calculator',
    title: 'Smart Stake Calculator',
    shortTitle: 'Stake Calculator',
    tagline: 'Confidence-driven fractional Kelly sizing, with hard guardrails.',
    href: '/tools/stake-calculator',
    status: 'live',
  },
  {
    slug: 'predictor',
    title: 'Daily AI Predictor',
    shortTitle: 'Predictor',
    tagline: "Five daily tickets, one per odds band, built from the day's highest-confidence selections.",
    href: '/predictor',
    status: 'soon',
    isBonus: true,
  },
];
