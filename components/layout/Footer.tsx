import Link from 'next/link';

const columns = [
  {
    heading: 'Tools',
    links: [
      { label: 'Booking code decoder', href: '/tools/decoder' },
      { label: 'Booking code converter', href: '/tools/converter' },
      { label: 'Bet splitter', href: '/tools/splitter' },
      { label: 'Odds comparison', href: '/tools/odds-comparison' },
      { label: 'Vault + result checker', href: '/tools/vault' },
      { label: 'Stake calculator', href: '/tools/stake-calculator' },
    ],
  },
  {
    heading: 'More',
    links: [
      { label: 'Daily predictor', href: '/predictor' },
      { label: 'All tools', href: '/tools' },
    ],
  },
  {
    heading: 'Company',
    links: [
      { label: 'About', href: '/about' },
      { label: 'Contact', href: '/contact' },
      { label: 'FAQ', href: '/faq' },
    ],
  },
  {
    heading: 'Legal',
    links: [
      { label: 'Privacy', href: '/privacy' },
      { label: 'Terms', href: '/terms' },
      { label: 'Disclaimer', href: '/about#disclaimer' },
    ],
  },
];

export function Footer() {
  return (
    <footer className="border-t border-footer-foreground/10 bg-footer text-footer-foreground/90 mt-20">
      <div className="max-w-6xl mx-auto px-4 py-14 grid grid-cols-2 md:grid-cols-6 gap-8">
        <div className="col-span-2">
          <p className="font-display text-xl font-semibold text-footer-foreground">BetMeter</p>
          <p className="mt-3 text-sm text-footer-foreground/60 max-w-xs">
            Booking code tools with a confidence score on every selection — decode, convert,
            split, compare, save, and size your stake.
          </p>
        </div>
        {columns.map((col) => (
          <div key={col.heading}>
            <p className="text-xs uppercase tracking-[0.14em] text-footer-foreground/50 font-mono mb-3">
              {col.heading}
            </p>
            <ul className="space-y-2">
              {col.links.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="text-sm text-footer-foreground/70 hover:text-footer-foreground transition-colors">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-white/10">
        <p className="max-w-6xl mx-auto px-4 py-5 text-xs text-footer-foreground/50">
          © {new Date().getFullYear()} BetMeter. Statistical analysis, not a guarantee — always bet responsibly.
        </p>
      </div>
    </footer>
  );
}
