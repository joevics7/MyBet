import Link from 'next/link';
import { Send } from 'lucide-react';

const TELEGRAM_BOT_URL = process.env.NEXT_PUBLIC_TELEGRAM_BOT_URL || 'https://t.me/betmeter_bot';

export function Header() {
  return (
    <header className="sticky top-0 z-30 bg-[hsl(var(--paper))]/95 backdrop-blur border-b border-border">
      <div className="max-w-6xl mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          <Link href="/" className="flex items-baseline gap-2">
            <span className="font-serif text-2xl font-semibold tracking-tight text-[hsl(var(--ink))]">
              BetMeter
            </span>
            <span className="hidden sm:inline text-[10px] uppercase tracking-[0.16em] text-[hsl(var(--verified))] font-mono">
              know before you bet
            </span>
          </Link>

          <nav className="hidden md:flex items-center gap-6 text-sm font-medium">
            <Link href="/tools" className="hover:text-[hsl(var(--verified))] transition-colors">
              Tools
            </Link>
            <Link href="/tools/vault" className="hover:text-[hsl(var(--verified))] transition-colors">
              Vault
            </Link>
            <Link href="/predictor" className="hover:text-[hsl(var(--verified))] transition-colors">
              Predictor
            </Link>
            <Link href="/faq" className="hover:text-[hsl(var(--verified))] transition-colors">
              FAQ
            </Link>
          </nav>

          <Link
            href={TELEGRAM_BOT_URL}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Open BetMeter on Telegram"
            className="flex items-center gap-1.5 h-9 px-3.5 rounded-full border border-border hover:border-[hsl(var(--verified))] hover:text-[hsl(var(--verified))] transition-colors text-xs font-semibold"
          >
            <Send className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Open bot</span>
          </Link>
        </div>
      </div>
    </header>
  );
}
