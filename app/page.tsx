import Link from 'next/link';
import { Metadata } from 'next';
import {
  ArrowRight, ShieldCheck, Gauge, Send, Layers, Search, ArrowLeftRight, Scissors,
  BarChart3, Archive, Calculator, Sparkles, type LucideIcon,
} from 'lucide-react';
import { ScoreGauge } from '@/components/ui/ScoreGauge';
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

const TOOL_ICONS: Record<string, LucideIcon> = {
  decoder: Search,
  converter: ArrowLeftRight,
  splitter: Scissors,
  'odds-comparison': BarChart3,
  vault: Archive,
  'stake-calculator': Calculator,
};

const SAMPLE = [
  { m: 'Arsenal v Chelsea', k: 'Over 2.5', s: 82, l: 'Safe' },
  { m: 'PSG v Lyon', k: 'BTTS Yes', s: 58, l: 'Medium' },
  { m: 'River Plate v Boca', k: '1X2 Away', s: 31, l: 'Risky' },
];

const TONE: Record<string, string> = {
  Safe: 'bg-safe/15 text-safe',
  Medium: 'bg-medium/15 text-medium',
  Risky: 'bg-risky/15 text-risky',
};

export default function HomePage() {
  const coreTools = TOOLS_CATALOG.filter((t) => !t.isBonus);
  const bonusTool = TOOLS_CATALOG.find((t) => t.isBonus);

  return (
    <div>
      {/* Hero */}
      <section className="relative border-b border-border overflow-hidden">
        <div className="absolute inset-0 bg-hero-glow" aria-hidden />
        <div className="absolute inset-0 bg-dot-grid" aria-hidden />
        <div className="relative max-w-6xl mx-auto px-4 py-14 md:py-24 grid grid-cols-1 md:grid-cols-[1.05fr_0.95fr] gap-12 md:gap-10 items-center">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full border border-brand/30 bg-brand/10 px-3 py-1 font-mono text-[11px] uppercase tracking-[0.14em] text-brand mb-6">
              <span className="h-1.5 w-1.5 rounded-full bg-brand animate-pulse" />
              Booking code tools &middot; Telegram + web
            </p>
            <h1 className="font-display text-4xl md:text-6xl font-bold leading-[1.05]">
              Know your slip <span className="text-gradient-brand">before</span> you bet it.
            </h1>
            <p className="mt-5 text-base md:text-lg text-muted-foreground max-w-md">
              Paste a booking code and get a confidence score on every selection &mdash; then decode,
              convert, split, compare odds, or vault it, all from one engine.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link
                href={TELEGRAM_BOT_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-full bg-brand text-brand-foreground shadow-glow px-6 py-3 text-sm font-semibold hover:opacity-90 transition-opacity"
              >
                <Send className="h-4 w-4" /> Open Telegram bot
              </Link>
              <Link
                href="/tools"
                className="inline-flex items-center gap-2 rounded-full border border-border bg-card/60 px-6 py-3 text-sm font-semibold hover:border-brand/60 hover:text-brand transition-colors"
              >
                Browse tools <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>

          {/* Sample slip */}
          <div className="slip-card rounded-2xl border border-border bg-card shadow-card">
            <div className="flex items-center justify-between px-6 pt-5 pb-4">
              <div>
                <p className="text-[11px] font-mono uppercase tracking-[0.14em] text-muted-foreground">
                  Sample ticket read
                </p>
                <p className="mt-1 font-mono text-sm font-semibold tracking-wider">BM-7K2Q9X</p>
              </div>
              <div className="text-right">
                <p className="text-[11px] font-mono uppercase tracking-[0.14em] text-muted-foreground">Total odds</p>
                <p className="mt-1 font-mono text-sm font-semibold">9.84</p>
              </div>
            </div>
            <div className="slip-tear mx-0" />
            <div className="p-4 space-y-2.5">
              {SAMPLE.map((row) => (
                <div key={row.m} className="flex items-center gap-3 rounded-xl border border-border bg-background/40 px-3.5 py-3">
                  <ScoreGauge score={row.s} size={46} label={row.l} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{row.m}</p>
                    <p className="text-xs text-muted-foreground">{row.k}</p>
                  </div>
                  <span className={`rounded-full px-2.5 py-1 text-[11px] font-mono font-semibold ${TONE[row.l]}`}>
                    {row.l}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="relative border-t border-border bg-background/40">
          <div className="max-w-6xl mx-auto px-4 py-4 flex flex-wrap items-center justify-center gap-x-10 gap-y-2">
            {TRUST.map((t) => (
              <div key={t.label} className="flex items-center gap-2 text-xs font-mono text-muted-foreground">
                <t.icon className="h-3.5 w-3.5 text-brand" strokeWidth={1.75} />
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
            <p className="font-mono text-xs uppercase tracking-[0.14em] text-brand mb-2">The tools</p>
            <h2 className="font-display text-2xl md:text-4xl font-bold">One engine, six tools</h2>
          </div>
          <Link href="/tools" className="text-sm font-semibold text-brand hidden sm:block">
            See all &rarr;
          </Link>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-5">
          {coreTools.map((tool) => {
            const Icon = TOOL_ICONS[tool.slug] ?? Gauge;
            return (
              <Link
                key={tool.slug}
                href={tool.href}
                className="group card-lift rounded-2xl border border-border bg-card p-6 shadow-card"
              >
                <div className="flex items-start justify-between">
                  <span className="grid h-11 w-11 place-items-center rounded-xl bg-brand/15 text-brand ring-1 ring-brand/25">
                    <Icon className="h-5 w-5" strokeWidth={2} />
                  </span>
                  <ArrowRight className="h-4 w-4 text-muted-foreground transition-all group-hover:translate-x-0.5 group-hover:text-brand" />
                </div>
                <p className="mt-5 font-display text-lg font-semibold leading-snug">{tool.shortTitle}</p>
                <p className="mt-2 text-sm text-muted-foreground">{tool.tagline}</p>
              </Link>
            );
          })}
        </div>
      </section>

      {/* Bonus predictor */}
      {bonusTool && (
        <section className="px-4 pb-16 md:pb-24">
          <div className="relative max-w-6xl mx-auto overflow-hidden rounded-3xl border border-border bg-card shadow-card">
            <div className="absolute inset-0 bg-hero-glow opacity-80" aria-hidden />
            <div className="relative p-8 md:p-12 grid grid-cols-1 md:grid-cols-[1fr_auto] gap-6 items-center">
              <div>
                <p className="inline-flex items-center gap-1.5 font-mono text-xs uppercase tracking-[0.14em] text-brand mb-3">
                  <Sparkles className="h-3.5 w-3.5" /> Bonus
                </p>
                <h2 className="font-display text-2xl md:text-4xl font-bold">{bonusTool.title}</h2>
                <p className="mt-3 text-muted-foreground max-w-lg">{bonusTool.tagline}</p>
              </div>
              <Link
                href={bonusTool.href}
                className="inline-flex items-center gap-2 rounded-full bg-brand text-brand-foreground shadow-glow px-6 py-3 text-sm font-semibold hover:opacity-90 transition-opacity whitespace-nowrap"
              >
                View today&rsquo;s tickets <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
