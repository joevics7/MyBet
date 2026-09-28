import Link from 'next/link';
import { Metadata } from 'next';
import { ArrowRight, BadgeCheck, ShieldCheck, Globe2, RefreshCw, Clock3 } from 'lucide-react';
import { HeroCardStack } from '@/components/home/HeroCardStack';
import { supabase } from '@/lib/supabase';

export const metadata: Metadata = {
  title: 'Edubase — Verified Scholarship Tracker & Education Guides',
  description: 'A verified scholarship tracker and plain-language education guides. Every scholarship linked to its official source, every guide cited.',
};

export const revalidate = 1800;

const TRUST = [
  { icon: ShieldCheck, label: 'Every figure sourced' },
  { icon: RefreshCw, label: 'Scholarships verified weekly' },
  { icon: Globe2, label: 'Growing country coverage' },
];

function daysUntil(dateStr: string) {
  return Math.ceil((new Date(dateStr).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

export default async function HomePage() {
  const [{ data: featured }, { data: guides }] = await Promise.all([
    supabase
      .from('scholarships')
      .select('slug, title, requirements_short, amount_short, deadline, countries(name, flag_emoji)')
      .eq('status', 'published')
      .eq('is_featured', true)
      .limit(3),
    supabase
      .from('blog_posts')
      .select('slug, title, excerpt, published_at')
      .eq('status', 'published')
      .order('published_at', { ascending: false })
      .limit(3),
  ]);

  return (
    <div>
      {/* Hero */}
      <section className="relative border-b border-border bg-dot-grid bg-hero-glow overflow-hidden">
        <div className="max-w-6xl mx-auto px-4 py-16 md:py-24 grid md:grid-cols-[1.05fr_0.95fr] gap-12 md:gap-8 items-center">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.16em] text-[hsl(var(--verified))] mb-5">
              Scholarships &middot; guides &middot; quizzes
            </p>
            <h1 className="font-serif text-4xl md:text-5xl font-semibold leading-[1.08] text-[hsl(var(--ink))]">
              Every scholarship,{' '}
              <span className="italic text-[hsl(var(--verified))]">verified</span>. Every
              guide, sourced.
            </h1>
            <p className="mt-5 text-base md:text-lg text-muted-foreground max-w-md">
              A live scholarship tracker and plain-language guides on applications, funding, and
              admissions &mdash; linked to the official source every time.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link
                href="/scholarships"
                className="inline-flex items-center gap-2 rounded-sm bg-[hsl(var(--ink))] text-[hsl(var(--paper))] px-5 py-3 text-sm font-semibold hover:opacity-90 transition-opacity"
              >
                Browse scholarships <ArrowRight className="h-3.5 w-3.5" />
              </Link>
              <Link
                href="/blog"
                className="inline-flex items-center gap-2 rounded-sm border border-border px-5 py-3 text-sm font-semibold hover:border-[hsl(var(--verified))] hover:text-[hsl(var(--verified))] transition-colors"
              >
                Read guides
              </Link>
            </div>
          </div>

          <HeroCardStack />
        </div>

        {/* Trust strip */}
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

      {/* Scholarship spotlight */}
      <section className="max-w-6xl mx-auto px-4 py-16 md:py-24">
        <div className="flex items-end justify-between mb-10">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.14em] text-[hsl(var(--verified))] mb-2">
              Spotlight
            </p>
            <h2 className="font-serif text-2xl md:text-3xl font-semibold">Scholarships worth tracking</h2>
          </div>
          <Link href="/scholarships" className="text-sm font-semibold text-[hsl(var(--verified))] hidden sm:block">
            Open tracker &rarr;
          </Link>
        </div>
        {(featured ?? []).length === 0 ? (
          <div className="rounded-sm border border-dashed border-border p-10 text-center">
            <p className="text-sm text-muted-foreground">
              Featured scholarships are being verified — check the tracker for the full list.
            </p>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-5">
            {(featured ?? []).map((s: any) => {
              const days = s.deadline ? daysUntil(s.deadline) : null;
              return (
                <Link
                  key={s.slug}
                  href={`/scholarships/scholarship/${s.slug}`}
                  className="group rounded-sm border border-border bg-card p-6 hover:border-[hsl(var(--seal))] hover:shadow-md transition-all"
                >
                  <div className="flex items-center justify-between">
                    <BadgeCheck className="h-5 w-5 text-[hsl(var(--seal))]" strokeWidth={1.75} />
                    {days !== null && days >= 0 && (
                      <span className="flex items-center gap-1 text-[10px] font-mono uppercase text-[hsl(var(--rust))]">
                        <Clock3 className="h-3 w-3" /> {days}d
                      </span>
                    )}
                  </div>
                  <p className="mt-4 font-serif text-base font-semibold">{s.title}</p>
                  <p className="mt-1 text-xs text-muted-foreground font-mono">
                    {s.countries ? `${s.countries.flag_emoji} ${s.countries.name}` : 'Global'}
                    {s.amount_short && ` · ${s.amount_short}`}
                  </p>
                  <span className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-[hsl(var(--verified))] opacity-0 group-hover:opacity-100 transition-opacity">
                    View details <ArrowRight className="h-3 w-3" />
                  </span>
                </Link>
              );
            })}
          </div>
        )}
      </section>

      {/* Latest guides */}
      <section className="border-t border-border bg-dot-grid">
        <div className="max-w-6xl mx-auto px-4 py-16 md:py-24">
          <div className="flex items-end justify-between mb-10">
            <div>
              <p className="font-mono text-xs uppercase tracking-[0.14em] text-[hsl(var(--verified))] mb-2">
                Resources
              </p>
              <h2 className="font-serif text-2xl md:text-3xl font-semibold">Latest guides</h2>
            </div>
            <Link href="/blog" className="text-sm font-semibold text-[hsl(var(--verified))] hidden sm:block">
              All guides &rarr;
            </Link>
          </div>
          {(guides ?? []).length === 0 ? (
            <div className="rounded-sm border border-dashed border-border p-10 text-center">
              <p className="text-sm text-muted-foreground">New guides are being researched and cited.</p>
            </div>
          ) : (
            <div className="grid md:grid-cols-3 gap-5">
              {(guides ?? []).map((g) => (
                <Link
                  key={g.slug}
                  href={`/blog/${g.slug}`}
                  className="rounded-sm border border-border bg-card p-6 hover:border-[hsl(var(--seal))] hover:shadow-md transition-all"
                >
                  <p className="font-serif text-base font-semibold leading-snug">{g.title}</p>
                  {g.excerpt && <p className="mt-2 text-sm text-muted-foreground line-clamp-3">{g.excerpt}</p>}
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
