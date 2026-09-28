import Link from 'next/link';
import { Metadata } from 'next';
import { ArrowLeft } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { ScholarshipsBrowser } from '@/components/scholarships/ScholarshipsBrowser';

export const metadata: Metadata = {
  title: 'Browse & Filter Scholarships',
  description: 'Search and filter every scholarship by country, level, and funding type. Every listing links to its official source.',
};

export const revalidate = 1800;

export default async function ScholarshipsBrowsePage({
  searchParams,
}: {
  searchParams?: { country?: string; level?: string; funding?: string };
}) {
  const [{ data: countries }, { data: scholarships }] = await Promise.all([
    supabase.from('countries').select('slug, name, flag_emoji').order('sort_order'),
    supabase
      .from('scholarships')
      .select('slug, title, summary, level, funding_type, deadline, is_closed, countries(slug, name, flag_emoji)')
      .eq('status', 'published')
      .order('deadline', { ascending: true }),
  ]);

  return (
    <div className="max-w-5xl mx-auto px-4 py-14">
      <Link
        href="/scholarships"
        className="inline-flex items-center gap-1.5 text-xs font-mono text-muted-foreground hover:text-[hsl(var(--verified))] mb-6"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Back to tracker
      </Link>

      <p className="text-xs uppercase tracking-[0.14em] font-mono text-[hsl(var(--verified))] mb-2">
        Browse all scholarships
      </p>
      <h1 className="font-serif text-3xl md:text-4xl font-semibold">
        Search &amp; filter every scholarship
      </h1>
      <p className="mt-3 text-muted-foreground max-w-lg">
        Filter by country, level, and funding type. Closed scholarships stay tagged rather than
        being deleted, so you always know what already passed.
      </p>

      <div className="mt-10">
        <ScholarshipsBrowser
          countries={countries ?? []}
          scholarships={(scholarships ?? []) as any}
          initialCountry={searchParams?.country ?? 'all'}
          initialLevel={searchParams?.level ?? 'all'}
          initialFunding={searchParams?.funding ?? 'all'}
        />
      </div>
    </div>
  );
}
