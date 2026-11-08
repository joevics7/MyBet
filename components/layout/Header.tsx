import Link from 'next/link';
import { Gauge, Send } from 'lucide-react';
import { ThemeToggle } from '@/components/theme/ThemeToggle';

const TELEGRAM_BOT_URL = process.env.NEXT_PUBLIC_TELEGRAM_BOT_URL || 'https://t.me/BetsMeterBot';

const NAV = [
  { href: '/tools', label: 'Tools' },
  { href: '/tools/vault', label: 'Vault' },
  { href: '/predictor', label: 'Predictor' },
  { href: '/faq', label: 'FAQ' },
];

export function Header() {
  return (
    <header className="sticky top-0 z-30 glass border-b border-border">
      <div className="max-w-6xl mx-auto px-4">
        <div className="flex items-center justify-between h-16 gap-3">
          <Link href="/" className="flex items-center gap-2.5">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand text-brand-foreground shadow-glow">
              <Gauge className="h-5 w-5" strokeWidth={2.5} />
            </span>
            <span className="font-display text-xl font-bold tracking-tight">BetMeter</span>
            <span className="hidden lg:inline text-[10px] uppercase tracking-[0.16em] text-brand font-mono">
              know before you bet
            </span>
          </Link>

          <nav className="hidden md:flex items-center gap-1 text-sm font-medium">
            {NAV.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                className="rounded-full px-3.5 py-1.5 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              >
                {n.label}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Link
              href={TELEGRAM_BOT_URL}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Open BetMeter on Telegram"
              className="flex items-center gap-1.5 h-9 px-3.5 rounded-full bg-brand text-brand-foreground hover:opacity-90 transition-opacity text-xs font-semibold shadow-glow"
            >
              <Send className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Open bot</span>
            </Link>
          </div>
        </div>
      </div>
    </header>
  );
}
