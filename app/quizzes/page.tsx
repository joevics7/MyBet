import Link from 'next/link';
import { Metadata } from 'next';
import {
  GraduationCap,
  Brain,
  Microscope,
  Landmark,
  Globe,
  Newspaper,
  ArrowRight,
  type LucideIcon,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { CountryStrip } from '@/components/tools/CountryStrip';

export const metadata: Metadata = {
  title: 'Quizzes — Test Your Knowledge, Country by Country',
  description: 'Quick quizzes across exam prep, general knowledge, science, history, geography, and current affairs — built for each country and language.',
};

export const revalidate = 3600;

const CATEGORY_ICONS: Record<string, LucideIcon> = {
  'exam-prep': GraduationCap,
  'general-knowledge': Brain,
  'science-nature': Microscope,
  'history-civics': Landmark,
  geography: Globe,
  'current-affairs': Newspaper,
};

export default async function QuizzesIndexPage({
  searchParams,
}: {
  searchParams?: { country?: string; category?: string };
}) {
  const [{ data: countries }, { data: categories }, { data: quizzes }] = await Promise.all([
    supabase.from('countries').select('slug, name, flag_emoji, is_live').order('sort_order'),
    supabase.from('quiz_categories').select('slug, name').order('name'),
    supabase
      .from('quizzes')
      .select('slug, title, description, countries(slug, name, flag_emoji), quiz_categories(slug, name)')
      .eq('status', 'published')
      .eq('language', 'en'),
  ]);

  const filtered = (quizzes ?? []).filter((q: any) => {
    if (searchParams?.country && q.countries?.slug !== searchParams.country) return false;
    if (searchParams?.category && q.quiz_categories?.slug !== searchParams.category) return false;
    return true;
  });

  return (
    <div className="max-w-6xl mx-auto px-4 py-14">
      <p className="text-xs uppercase tracking-[0.14em] font-mono text-[hsl(var(--verified))] mb-2">
        Quizzes
      </p>
      <h1 className="font-serif text-3xl md:text-4xl font-semibold">
        Test your knowledge, country by country
      </h1>
      <p className="mt-3 text-muted-foreground max-w-lg">
        Quick, scored quizzes across exam prep, general knowledge, and more — with more
        countries and languages added regularly.
      </p>

      <div className="mt-8">
        <CountryStrip countries={countries ?? []} basePath="/quizzes" />
      </div>

      <div className="mt-10">
        <h2 className="font-serif text-xl font-semibold mb-4">Browse by category</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
          {(categories ?? []).map((cat) => {
            const Icon = CATEGORY_ICONS[cat.slug] ?? Brain;
            return (
              <Link
                key={cat.slug}
                href={`/quizzes?category=${cat.slug}`}
                className="group rounded-sm border border-border bg-card p-4 hover:border-[hsl(var(--seal))] transition-colors"
              >
                <Icon className="h-4.5 w-4.5 text-[hsl(var(--seal))]" strokeWidth={1.75} />
                <p className="mt-2.5 text-sm font-semibold leading-snug">{cat.name}</p>
              </Link>
            );
          })}
        </div>
      </div>

      <div className="mt-14 border-t border-border pt-10">
        <h2 className="font-serif text-xl font-semibold mb-4">
          {filtered.length} {filtered.length === 1 ? 'quiz' : 'quizzes'} live
        </h2>
        {filtered.length === 0 ? (
          <div className="border border-dashed border-border rounded-sm p-10 text-center">
            <p className="text-sm text-muted-foreground">
              No quizzes for this filter yet — new ones are being added country by country.
            </p>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 gap-4">
            {filtered.map((q: any) => (
              <Link
                key={q.slug}
                href={`/quizzes/country/${q.countries.slug}/${q.slug}`}
                className="group rounded-sm border border-border bg-card p-5 hover:border-[hsl(var(--seal))] transition-colors"
              >
                <p className="text-xs font-mono text-muted-foreground">
                  {q.countries?.flag_emoji} {q.countries?.name}
                  {q.quiz_categories && ` · ${q.quiz_categories.name}`}
                </p>
                <h3 className="font-serif text-lg font-semibold mt-1.5">{q.title}</h3>
                {q.description && <p className="mt-1.5 text-sm text-muted-foreground">{q.description}</p>}
                <span className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-[hsl(var(--verified))] opacity-0 group-hover:opacity-100 transition-opacity">
                  Take quiz <ArrowRight className="h-3 w-3" />
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
