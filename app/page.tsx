import Link from 'next/link';
import { Metadata } from 'next';
import { ArrowRight, ShieldCheck, Gauge, Send, Layers } from 'lucide-react';
import { TOOLS_CATALOG } from '@/lib/toolsData';

const TELEGRAM_BOT_URL = process.env.NEXT_PUBLIC_TELEGRAM_BOT_URL || 'https://t.me/BetsMeterBot';

export const metadata: Metadata = {
  title: 'BetMeter — Smarter Booking Code Tools',
  description: 'Decode, convert, split, and check booking codes with a confidence score on every selection. Telegram bot + web tools for smarter betting slips.',
};

const TRUST = [
  { icon: Gauge, label: 'Every selection scored, not just decoded' },
  { icon: Layers, label: 'One engine powers every tool' },
  { icon: ShieldCheck, label: 'Neutral results — wins and losses shown equally' },
];

export default function HomePage() {
  const coreTools = TOOLS_CATALOG.filter((t) => !t.isBonus);
  const bonusTool = TOOLS_CATALOG.find((t) => t.isBonus);

  return (
    <div>
      {/* Hero */}
      <section className="relative border-b border-border bg-dot-grid bg-hero-glow overflow-hidden">
        <div className="max-w-6xl mx-auto px-4 py-16 md:py-24 grid md:grid-cols-[1.05fr_0.95fr] gap-12 md:gap-8 items-center">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.16em] text-[hsl(var(--verified))] mb-5">
              Booking code tools &middot; Telegram bot + web
            </p>
            <h1 className="font-serif text-4xl md:text-5xl font-semibold leading-[1.08] text-[hsl(var(--ink))]">
              Know your slip{' '}
              <span className="italic text-[hsl(var(--verified))]">before</span> you bet it.
            </h1>
            <p className="mt-5 text-base md:text-lg text-muted-foreground max-w-md">
              Paste a booking code and get a confidence score on every selection — then decode,
              convert, split, compare odds, or vault it, all from one engine.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link
                href={TELEGRAM_BOT_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-sm bg-[hsl(var(--ink))] text-[hsl(var(--paper))] px-5 py-3 text-sm font-semibold hover:opacity-90 transition-opacity"
              >
                <Send className="h-3.5 w-3.5" /> Open Telegram bot
              </Link>
              <Link
                href="/tools"
                className="inline-flex items-center gap-2 rounded-sm border border-border px-5 py-3 text-sm font-semibold hover:border-[hsl(var(--verified))] hover:text-[hsl(var(--verified))] transition-colors"
              >
                Browse tools <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </div>

          <div className="rounded-sm border border-border bg-card p-6">
            <p className="text-xs font-mono uppercase tracking-[0.14em] text-muted-foreground mb-4">
              Sample ticket read
            </p>
            <div className="space-y-3">
              {[
                { m: 'Arsenal v Chelsea — Over 2.5', s: 82, l: 'Safe' },
                { m: 'PSG v Lyon — BTTS Yes', s: 58, l: 'Medium' },
                { m: 'River Plate v Boca — 1X2 Away', s: 31, l: 'Risky' },
              ].map((row) => (
                <div key={row.m} className="flex items-center justify-between rounded-sm border border-border px-3.5 py-2.5">
                  <span className="text-sm">{row.m}</span>
                  <span
                    className={`text-xs font-mono font-semibold ${
                      row.s >= 70
                        ? 'text-[hsl(var(--verified))]'
                        : row.s >= 40
                        ? 'text-amber-600'
                        : 'text-[hsl(var(--rust))]'
                    }`}
                  >
                    {row.s} &middot; {row.l}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="relative border-t border-border">
          <div className="max-w-6xl mx-auto px-4 py-4 flex flex-wrap items-center justify-center gap-x-10 gap-y-2">
            {TRUST.map((t) => (
              <div key={t.label} className="flex items-center gap-2 text-xs font-mono text-muted-foreground">
                <t.icon className="h-3.5 w-3.5 text-[hsl(var(--seal))]" strokeWidth={1.75} />
                {t.label}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Tool grid */}
      <section className="max-w-6xl mx-auto px-4 py-16 md:py-24">
        <div className="flex items-end justify-between mb-10">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.14em] text-[hsl(var(--verified))] mb-2">
              The tools
            </p>
            <h2 className="font-serif text-2xl md:text-3xl font-semibold">One engine, six tools</h2>
          </div>
          <Link href="/tools" className="text-sm font-semibold text-[hsl(var(--verified))] hidden sm:block">
            See all &rarr;
          </Link>
        </div>
        <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-5">
          {coreTools.map((tool) => (
            <Link
              key={tool.slug}
              href={tool.href}
              className="group rounded-sm border border-border bg-card p-6 hover:border-[hsl(var(--seal))] hover:shadow-md transition-all"
            >
              <p className="font-serif text-base font-semibold leading-snug">{tool.shortTitle}</p>
              <p className="mt-2 text-sm text-muted-foreground">{tool.tagline}</p>
              <span className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-[hsl(var(--verified))] opacity-0 group-hover:opacity-100 transition-opacity">
                Open tool <ArrowRight className="h-3 w-3" />
              </span>
            </Link>
          ))}
        </div>
      </section>

      {/* Bonus predictor */}
      {bonusTool && (
        <section className="border-t border-border bg-dot-grid">
          <div className="max-w-6xl mx-auto px-4 py-16 md:py-24">
            <div className="grid md:grid-cols-[1fr_auto] gap-6 items-center">
              <div>
                <p className="font-mono text-xs uppercase tracking-[0.14em] text-[hsl(var(--verified))] mb-2">
                  Bonus
                </p>
                <h2 className="font-serif text-2xl md:text-3xl font-semibold">{bonusTool.title}</h2>
                <p className="mt-3 text-muted-foreground max-w-lg">{bonusTool.tagline}</p>
              </div>
              <Link
                href={bonusTool.href}
                className="inline-flex items-center gap-2 rounded-sm border border-border px-5 py-3 text-sm font-semibold hover:border-[hsl(var(--verified))] hover:text-[hsl(var(--verified))] transition-colors whitespace-nowrap"
              >
                View today&rsquo;s tickets <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
