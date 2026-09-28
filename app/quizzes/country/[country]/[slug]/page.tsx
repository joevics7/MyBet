import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Metadata } from 'next';
import { supabase } from '@/lib/supabase';
import { QuizPlayer } from '@/components/quizzes/QuizPlayer';
import { CUSTOM_QUIZ_COMPONENTS } from '@/components/quizzes/customRegistry';
import type { Quiz } from '@/lib/supabase';

export const revalidate = 3600;

async function getQuiz(countrySlug: string, quizSlug: string) {
  const { data } = await supabase
    .from('quizzes')
    .select('*, countries!inner(slug, name, flag_emoji), quiz_categories(name)')
    .eq('slug', quizSlug)
    .eq('countries.slug', countrySlug)
    .eq('status', 'published')
    .maybeSingle();
  return data;
}

export async function generateMetadata({
  params,
}: {
  params: { country: string; slug: string };
}): Promise<Metadata> {
  const quiz = await getQuiz(params.country, params.slug);
  if (!quiz) return {};
  return { title: quiz.title, description: quiz.description ?? undefined };
}

export default async function QuizPage({ params }: { params: { country: string; slug: string } }) {
  const quiz = await getQuiz(params.country, params.slug);
  if (!quiz) notFound();

  const questions = (quiz.questions ?? []) as any[];

  return (
    <div className="max-w-2xl mx-auto px-4 py-10">
      <nav className="text-xs text-muted-foreground mb-6 flex items-center gap-1.5 font-mono">
        <Link href="/quizzes" className="hover:text-[hsl(var(--verified))]">Quizzes</Link>
        <span>/</span>
        <Link href={`/quizzes?country=${quiz.countries.slug}`} className="hover:text-[hsl(var(--verified))]">
          {quiz.countries.flag_emoji} {quiz.countries.name}
        </Link>
        <span>/</span>
        <span className="text-foreground">{quiz.title}</span>
      </nav>

      <p className="text-xs uppercase tracking-[0.14em] font-mono text-[hsl(var(--verified))] mb-2">
        {quiz.countries.flag_emoji} {quiz.countries.name}
        {quiz.quiz_categories && ` · ${quiz.quiz_categories.name}`}
      </p>
      <h1 className="font-serif text-3xl font-semibold leading-tight">{quiz.title}</h1>
      {quiz.description && <p className="mt-3 text-muted-foreground">{quiz.description}</p>}

      <div className="mt-8">
        {quiz.quiz_type === 'custom' ? (
          <CustomQuizSlot quiz={quiz as unknown as Quiz} />
        ) : (
          <QuizPlayer questions={questions} />
        )}
      </div>
    </div>
  );
}

function CustomQuizSlot({ quiz }: { quiz: Quiz }) {
  const Component = quiz.custom_component_key
    ? CUSTOM_QUIZ_COMPONENTS[quiz.custom_component_key]
    : undefined;

  if (!Component) {
    // Falls back gracefully rather than 404ing if a custom quiz is marked
    // but its component hasn't been built/registered yet.
    return (
      <div className="rounded-sm border border-dashed border-border p-8 text-center">
        <p className="text-sm text-muted-foreground">
          This quiz uses a custom format that&rsquo;s still being built — check back soon.
        </p>
      </div>
    );
  }

  return <Component quiz={quiz} />;
}
