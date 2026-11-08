import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, Clock } from 'lucide-react';
import { listArticles } from '@/lib/services/content';

export const revalidate = 3600;

export const metadata: Metadata = {
  title: 'Betting Guides & Booking Code Tips',
  description:
    'Guides on booking codes, odds, bankroll sizing and smarter slips — written for bettors who want to know the risk before they stake.',
  alternates: { canonical: '/blog' },
};

function label(slug: string) {
  return slug.replace(/-/g, ' ');
}

export default async function BlogIndexPage() {
  const articles = await listArticles();

  return (
    <div className="relative max-w-6xl mx-auto w-full px-4 py-12 md:py-16">
      <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-72 bg-hero-glow opacity-60" aria-hidden />
      <p className="font-mono text-xs uppercase tracking-[0.14em] text-brand mb-2">The BetMeter blog</p>
      <h1 className="font-display text-3xl md:text-5xl font-bold leading-tight">
        Smarter slips start with better information
      </h1>
      <p className="mt-4 max-w-2xl text-muted-foreground">
        Practical guides on booking codes, odds and staking — no hype, just how the numbers work.
      </p>

      {articles.length === 0 ? (
        <div className="mt-12 rounded-2xl border border-dashed border-border bg-card/50 p-10 text-center text-muted-foreground">
          New guides are on the way. Meanwhile, try the{' '}
          <Link href="/tools" className="text-brand hover:underline">
            tools
          </Link>
          .
        </div>
      ) : (
        <div className="mt-12 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {articles.map((a) => (
            <Link
              key={a.slug}
              href={`/blog/${a.slug}`}
              className="group card-lift flex flex-col rounded-2xl border border-border bg-card p-6 shadow-card"
            >
              <span className="self-start rounded-full bg-brand/15 px-2.5 py-1 font-mono text-[11px] uppercase tracking-wider text-brand">
                {label(a.category)}
              </span>
              <h2 className="mt-4 font-display text-lg font-semibold leading-snug">{a.title}</h2>
              {a.excerpt && <p className="mt-2 text-sm text-muted-foreground line-clamp-3">{a.excerpt}</p>}
              <div className="mt-auto pt-5 flex items-center justify-between text-xs text-muted-foreground font-mono">
                <span className="inline-flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5" /> {a.readingTime} min read
                </span>
                <ArrowRight className="h-4 w-4 transition-all group-hover:translate-x-0.5 group-hover:text-brand" />
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
