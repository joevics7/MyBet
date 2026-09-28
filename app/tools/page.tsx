import { Metadata } from 'next';
import Link from 'next/link';
import {
  ClipboardCheck,
  Calculator,
  GraduationCap,
  Banknote,
  Wallet,
  Plane,
  Award,
  Languages,
  Briefcase,
  FileText,
  ArrowRight,
  type LucideIcon,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { ToolsBrowser } from '@/components/tools/ToolsBrowser';
import { CountryStrip } from '@/components/tools/CountryStrip';

export const metadata: Metadata = {
  title: 'Tools — Calculators, Practice Tests & Checkers',
  description: 'Browse every Edubase tool by country and category — GPA calculators, exam practice, admission checkers, loan and budget tools.',
};

export const revalidate = 3600;

const CATEGORY_ICONS: Record<string, LucideIcon> = {
  'exam-practice': ClipboardCheck,
  'gpa-calculator': Calculator,
  admission: GraduationCap,
  'loans-funding': Banknote,
  budgeting: Wallet,
  'study-abroad': Plane,
  'scholarship-tools': Award,
  'language-test-prep': Languages,
  'career-vocational': Briefcase,
  'application-documents': FileText,
};

export default async function ToolsIndexPage({
  searchParams,
}: {
  searchParams?: { q?: string; category?: string; country?: string };
}) {
  const [{ data: countries }, { data: categories }] = await Promise.all([
    supabase.from('countries').select('slug, name, flag_emoji, is_live').order('sort_order'),
    supabase.from('categories').select('slug, name, description, icon').order('name'),
  ]);

  return (
    <div className="max-w-6xl mx-auto px-4 py-14">
      <p className="text-xs uppercase tracking-[0.14em] font-mono text-[hsl(var(--verified))] mb-2">
        Tools
      </p>
      <h1 className="font-serif text-3xl md:text-4xl font-semibold">
        Calculators, practice tests & checkers
      </h1>
      <p className="mt-3 text-muted-foreground max-w-lg">
        Search by name, or filter by country and category. Every tool cites the official policy
        it&rsquo;s built from.
      </p>

      {/* Country strip — equal treatment, no country singled out */}
      <div className="mt-8">
        <CountryStrip countries={countries ?? []} />
      </div>

      {/* Category grid */}
      <div className="mt-10">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-serif text-xl font-semibold">Browse by category</h2>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
          {(categories ?? []).map((cat) => {
            const Icon = CATEGORY_ICONS[cat.slug] ?? Calculator;
            return (
              <Link
                key={cat.slug}
                href={`/tools?category=${cat.slug}`}
                className="group rounded-sm border border-border bg-card p-4 hover:border-[hsl(var(--seal))] transition-colors"
              >
                <Icon className="h-4.5 w-4.5 text-[hsl(var(--seal))]" strokeWidth={1.75} />
                <p className="mt-2.5 text-sm font-semibold leading-snug">{cat.name}</p>
                <span className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-semibold text-[hsl(var(--verified))] opacity-0 group-hover:opacity-100 transition-opacity">
                  Browse <ArrowRight className="h-2.5 w-2.5" />
                </span>
              </Link>
            );
          })}
        </div>
      </div>

      {/* Search + filter */}
      <div className="mt-14 border-t border-border pt-10">
        <h2 className="font-serif text-xl font-semibold mb-4">Search all tools</h2>
        <ToolsBrowser
          countries={countries ?? []}
          categories={categories ?? []}
          initialQuery={searchParams?.q ?? ''}
          initialCategory={searchParams?.category ?? 'all'}
          initialCountry={searchParams?.country ?? 'all'}
        />
      </div>
    </div>
  );
}
