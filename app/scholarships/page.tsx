import Link from 'next/link';
import { Metadata } from 'next';
import { ArrowRight, BadgeCheck, Search } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { DeadlineBoard } from '@/components/scholarships/DeadlineBoard';
import { CountryStrip } from '@/components/tools/CountryStrip';

export const metadata: Metadata = {
  title: 'Scholarship Tracker — Verified & Sourced',
  description: 'A live tracker of scholarship deadlines, fully funded opportunities, and regional listings — every scholarship linked to its official source.',
};

export const revalidate = 1800;

export default async function ScholarshipTrackerPage() {
  const [{ data: countries }, { data: closingSoon }, { data: featured }] = await Promise.all([
    supabase.from('countries').select('slug, name, flag_emoji, is_live').order('sort_order'),
    supabase
      .from('scholarships')
      .select('slug, title, level, requirements_short, amount_short, deadline, board_priority, countries(name, flag_emoji)')
      .eq('status', 'published')
      .eq('is_closed', false)
      .not('deadline', 'is', null)
      .order('board_priority', { ascending: true, nullsFirst: false })
      .order('deadline', { ascending: true })
      .limit(8),
    supabase
      .from('scholarships')
      .select('slug, title, summary, requirements_short, amount_short, countries(name, flag_emoji)')
      .eq('status', 'published')
      .eq('is_featured', true)
      .order('board_priority', { ascending: true, nullsFirst: false })
      .limit(6),
  ]);

  return (
    <div className="max-w-5xl mx-auto px-4 py-14">
      <p className="text-xs uppercase tracking-[0.14em] font-mono text-[hsl(var(--verified))] mb-2">
        Scholarship tracker
      </p>
      <h1 className="font-serif text-3xl md:text-4xl font-semibold">
        A live board of verified deadlines
      </h1>
      <p className="mt-3 text-muted-foreground max-w-lg">
        Every scholarship here links to its official source, and closed ones stay tagged rather
        than disappearing. Updated weekly.
      </p>

      <div className="mt-6 flex flex-wrap gap-3">
        <Link
          href="/scholarships/browse"
          className="inline-flex items-center gap-2 rounded-sm border border-border px-4 py-2.5 text-sm font-semibold hover:border-[hsl(var(--verified))] hover:text-[hsl(var(--verified))] transition-colors"
        >
          <Search className="h-3.5 w-3.5" /> Search &amp; filter all scholarships
        </Link>
      </div>

      {/* Departures board — closing soon */}
      <section className="mt-12">
        <h2 className="font-serif text-xl font-semibold mb-4">Closing soon</h2>
        <DeadlineBoard scholarships={(closingSoon ?? []) as any} />
      </section>

      {/* Editorial spotlight — curated via is_featured, independent of funding type */}
      <section className="mt-14">
        <div className="flex items-center gap-2 mb-4">
          <BadgeCheck className="h-4.5 w-4.5 text-[hsl(var(--seal))]" strokeWidth={1.75} />
          <h2 className="font-serif text-xl font-semibold">Spotlight</h2>
        </div>
        {(featured ?? []).length === 0 ? (
          <div className="rounded-sm border border-dashed border-border p-10 text-center">
            <p className="text-sm text-muted-foreground">
              Featured listings are being verified — check back soon.
            </p>
          </div>
        ) : (
          <div className="flex gap-4 overflow-x-auto hide-scrollbar pb-2">
            {(featured ?? []).map((s: any) => (
              <Link
                key={s.slug}
                href={`/scholarships/scholarship/${s.slug}`}
                className="shrink-0 w-64 rounded-sm border border-border bg-card p-5 hover:border-[hsl(var(--seal))] transition-colors"
              >
                <p className="text-xs font-mono text-muted-foreground">
                  {s.countries ? `${s.countries.flag_emoji} ${s.countries.name}` : 'Global'}
                </p>
                <p className="font-serif text-base font-semibold mt-1.5">{s.title}</p>
                {s.summary && <p className="mt-1.5 text-xs text-muted-foreground line-clamp-2">{s.summary}</p>}
                {(s.requirements_short || s.amount_short) && (
                  <p className="mt-2 pt-2 border-t border-border font-mono text-[11px] text-[hsl(var(--verified))]">
                    {[s.requirements_short, s.amount_short].filter(Boolean).join(' · ')}
                  </p>
                )}
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* Browse by region */}
      <section className="mt-14">
        <h2 className="font-serif text-xl font-semibold mb-4">Browse by region</h2>
        <CountryStrip countries={countries ?? []} basePath="/scholarships/browse" />
      </section>

      <div className="mt-14 border-t border-border pt-8 flex items-center justify-between flex-wrap gap-3">
        <p className="text-sm text-muted-foreground">
          Want every scholarship in one filterable list instead?
        </p>
        <Link
          href="/scholarships/browse"
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-[hsl(var(--verified))]"
        >
          Open full directory <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </div>
  );
}
