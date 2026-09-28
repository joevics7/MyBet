import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Metadata } from 'next';
import { ArrowLeft, Clock3, ExternalLink } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { ResultSlip } from '@/components/ResultSlip';
import BlogMarkdownRenderer from '@/components/BlogMarkdownRenderer';

export const revalidate = 1800;

const LEVEL_LABEL: Record<string, string> = {
  undergraduate: 'Undergraduate',
  masters: 'Masters',
  phd: 'PhD',
  postdoc: 'Postdoc',
  any: 'Any level',
};

const FUNDING_LABEL: Record<string, string> = {
  full: 'Fully funded',
  partial: 'Partial funding',
  tuition_only: 'Tuition only',
  stipend_only: 'Stipend only',
};

async function getScholarship(slug: string) {
  const { data } = await supabase
    .from('scholarships')
    .select('*, countries(slug, name, flag_emoji)')
    .eq('slug', slug)
    .eq('status', 'published')
    .maybeSingle();
  return data;
}

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const s = await getScholarship(params.slug);
  if (!s) return {};
  return { title: s.title, description: s.summary ?? undefined };
}

function daysUntil(dateStr: string) {
  return Math.ceil((new Date(dateStr).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

export default async function ScholarshipPage({ params }: { params: { slug: string } }) {
  const s = await getScholarship(params.slug);
  if (!s) notFound();

  const days = s.deadline ? daysUntil(s.deadline) : null;

  let related: any[] = [];
  if (s.country_id) {
    const { data } = await supabase
      .from('scholarships')
      .select('slug, title, requirements_short, amount_short, countries(flag_emoji, name)')
      .eq('status', 'published')
      .eq('country_id', s.country_id)
      .neq('slug', s.slug)
      .limit(3);
    related = data ?? [];
  }

  const slipRows = [
    ...(s.deadline
      ? [
          {
            label: 'Deadline',
            value: new Date(s.deadline).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' }),
            emphasis: true,
          },
        ]
      : []),
    ...(s.level ? [{ label: 'Level', value: LEVEL_LABEL[s.level] ?? s.level }] : []),
    ...(s.funding_type ? [{ label: 'Funding', value: FUNDING_LABEL[s.funding_type] ?? s.funding_type }] : []),
    ...(s.requirements_short ? [{ label: 'Requirements', value: s.requirements_short }] : []),
    ...(s.amount_short ? [{ label: 'Amount', value: s.amount_short }] : []),
  ];

  return (
    <div className="max-w-6xl mx-auto px-4 py-10">
      <Link
        href="/scholarships"
        className="inline-flex items-center gap-1.5 text-xs font-mono text-muted-foreground hover:text-[hsl(var(--verified))] mb-6"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Back to tracker
      </Link>

      <div className="grid md:grid-cols-[1.15fr_1fr] gap-10">
        <div>
          <p className="text-xs uppercase tracking-[0.14em] font-mono text-[hsl(var(--verified))] mb-2 flex items-center gap-2">
            {s.countries ? `${s.countries.flag_emoji} ${s.countries.name}` : 'Global'}
            {s.is_closed && (
              <span className="text-[hsl(var(--rust))] border border-[hsl(var(--rust))]/40 rounded-full px-2 py-0.5">
                Closed
              </span>
            )}
          </p>
          <h1 className="font-serif text-3xl md:text-4xl font-semibold leading-tight">{s.title}</h1>
          {s.summary && <p className="mt-3 text-muted-foreground max-w-lg">{s.summary}</p>}

          {s.eligibility_md && (
            <div className="mt-8">
              <h2 className="font-serif text-xl font-semibold mb-2">Who can apply</h2>
              <BlogMarkdownRenderer content={s.eligibility_md} className="prose-sm" />
            </div>
          )}

          {s.benefits_md && (
            <div className="mt-8">
              <h2 className="font-serif text-xl font-semibold mb-2">Benefits & amount</h2>
              <BlogMarkdownRenderer content={s.benefits_md} className="prose-sm" />
            </div>
          )}

          {s.required_documents_md && (
            <div className="mt-8">
              <h2 className="font-serif text-xl font-semibold mb-2">Required documents</h2>
              <BlogMarkdownRenderer content={s.required_documents_md} className="prose-sm" />
            </div>
          )}

          {s.application_process_md && (
            <div className="mt-8">
              <h2 className="font-serif text-xl font-semibold mb-2">Application process</h2>
              <BlogMarkdownRenderer content={s.application_process_md} className="prose-sm" />
            </div>
          )}

          {related.length > 0 && (
            <div className="mt-12 border-t border-border pt-8">
              <h2 className="font-serif text-xl font-semibold mb-4">Related scholarships</h2>
              <div className="grid sm:grid-cols-3 gap-4">
                {related.map((r) => (
                  <Link
                    key={r.slug}
                    href={`/scholarships/scholarship/${r.slug}`}
                    className="rounded-sm border border-border bg-card p-4 hover:border-[hsl(var(--seal))] transition-colors"
                  >
                    <p className="text-xs font-mono text-muted-foreground">
                      {r.countries?.flag_emoji} {r.countries?.name}
                    </p>
                    <p className="font-serif text-sm font-semibold mt-1">{r.title}</p>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>

        <div>
          <div className="md:sticky md:top-24 space-y-4">
            {days !== null && days >= 0 && !s.is_closed && (
              <div className="flex items-center gap-2 rounded-sm border border-[hsl(var(--rust))]/40 bg-[hsl(var(--rust))]/5 px-4 py-2.5 text-sm font-mono text-[hsl(var(--rust))]">
                <Clock3 className="h-4 w-4" /> {days} day{days === 1 ? '' : 's'} left to apply
              </div>
            )}

            <ResultSlip heading="Scholarship Summary" stampLabel={s.is_closed ? 'Closed' : 'Open'} rows={slipRows} />

            {s.official_apply_url && (
              <a
                href={s.official_apply_url}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className={`flex items-center justify-center gap-2 w-full rounded-sm py-3 text-sm font-semibold transition-opacity hover:opacity-90 ${
                  s.is_closed
                    ? 'border border-border text-muted-foreground'
                    : 'bg-[hsl(var(--ink))] text-[hsl(var(--paper))]'
                }`}
              >
                {s.is_closed ? 'View official page' : 'Apply on official site'} <ExternalLink className="h-3.5 w-3.5" />
              </a>
            )}

            {s.eligibility_source_url && (
              <div className="rounded-sm border border-border bg-muted/40 px-4 py-3 text-xs text-muted-foreground">
                <p>
                  Sourced from{' '}
                  <a
                    href={s.eligibility_source_url}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                    className="text-[hsl(var(--verified))] font-medium hover:underline"
                  >
                    the official listing
                  </a>
                  {s.last_reviewed_at && (
                    <>
                      . Last reviewed{' '}
                      <span className="font-mono">
                        {new Date(s.last_reviewed_at).toLocaleDateString()}
                      </span>
                    </>
                  )}
                  .
                </p>
                <p className="mt-2">
                  Figures are estimates for planning. Always confirm with the official source before applying.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
