import type { Metadata } from 'next';
import Link from 'next/link';
import { ChevronRight, Gauge, Layers, ShieldCheck, Ban } from 'lucide-react';

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://betmeter.com';

export const metadata: Metadata = {
  title: 'About BetMeter',
  description: 'What BetMeter is, how the confidence engine works, and the design principles behind every tool.',
  alternates: { canonical: `${siteUrl}/about` },
  openGraph: {
    title: 'About BetMeter',
    description: 'What BetMeter is, how the confidence engine works, and the design principles behind every tool.',
    url: `${siteUrl}/about`,
    type: 'website',
  },
};

export default function AboutPage() {
  return (
    <div className="max-w-6xl mx-auto px-4 py-14">
      <nav className="flex items-center gap-1.5 text-xs text-muted-foreground mb-8 font-mono" aria-label="Breadcrumb">
        <Link href="/" className="hover:text-[hsl(var(--verified))] transition-colors">Home</Link>
        <ChevronRight className="h-3 w-3" />
        <span>About</span>
      </nav>

      <div className="max-w-2xl">
        <p className="text-xs uppercase tracking-[0.14em] font-mono text-[hsl(var(--verified))] mb-2">About</p>
        <h1 className="font-serif text-3xl md:text-4xl font-semibold leading-tight">
          One engine behind every tool
        </h1>
        <p className="mt-4 text-muted-foreground leading-relaxed">
          BetMeter started from a simple observation: most booking-code tools just decode a
          slip and stop there. They show you the games, but not whether the slip is any good.
          Every tool here is built on the same Decode, Confidence, and Encode services, so the
          risk read you get in one tool matches what you&rsquo;d see anywhere else on the site
          or in the Telegram bot.
        </p>
        <p className="mt-4 text-muted-foreground leading-relaxed">
          BetMeter is a tools platform, not a bookmaker — it doesn&rsquo;t take bets, hold
          funds, or set odds. It reads booking codes and public form/stats data, and tells you
          plainly what that data suggests.
        </p>
      </div>

      <div className="mt-12 grid sm:grid-cols-2 gap-4">
        <div className="p-5 border border-border bg-card rounded-sm">
          <Gauge className="h-5 w-5 text-[hsl(var(--seal))] mb-3" strokeWidth={1.75} />
          <h3 className="font-serif font-semibold text-sm mb-1">Every selection scored</h3>
          <p className="text-xs text-muted-foreground">
            Not just decoded — each selection gets a 0-100 confidence score with a one-line
            reason, so &ldquo;no data available&rdquo; is shown honestly instead of a fake number.
          </p>
        </div>
        <div className="p-5 border border-border bg-card rounded-sm">
          <Layers className="h-5 w-5 text-[hsl(var(--seal))] mb-3" strokeWidth={1.75} />
          <h3 className="font-serif font-semibold text-sm mb-1">One shared engine</h3>
          <p className="text-xs text-muted-foreground">
            Decode, Confidence, Encode, and Odds Lookup are built once and reused across every
            tool — a converter isn&rsquo;t a different codebase from a splitter.
          </p>
        </div>
        <div className="p-5 border border-border bg-card rounded-sm">
          <ShieldCheck className="h-5 w-5 text-[hsl(var(--seal))] mb-3" strokeWidth={1.75} />
          <h3 className="font-serif font-semibold text-sm mb-1">Neutral by design</h3>
          <p id="disclaimer" className="text-xs text-muted-foreground">
            Vault results and predictor tickets are reported factually — no near-miss framing,
            no reactive prompts after a loss. Statistical analysis, never a guarantee.
          </p>
        </div>
        <div className="p-5 border border-border bg-card rounded-sm">
          <Ban className="h-5 w-5 text-[hsl(var(--seal))] mb-3" strokeWidth={1.75} />
          <h3 className="font-serif font-semibold text-sm mb-1">No blanket scraping</h3>
          <p className="text-xs text-muted-foreground">
            The Odds Lookup Service only checks the games you&rsquo;ve actually decoded or
            searched — not a live tracker polling every match on every platform.
          </p>
        </div>
      </div>
    </div>
  );
}
