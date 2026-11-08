import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowRight, Clock } from 'lucide-react';
import { getArticle } from '@/lib/services/content';
import { TOOLS_CATALOG } from '@/lib/toolsData';
import { Markdown } from '@/components/content/Markdown';

export const revalidate = 3600;

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://betmeter.com';

type Props = { params: { slug: string } };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const a = await getArticle(params.slug);
  if (!a) return { title: 'Article not found' };
  const description = a.metaDescription || a.excerpt || undefined;
  return {
    title: a.title,
    description,
    alternates: { canonical: `/blog/${a.slug}` },
    openGraph: {
      type: 'article',
      title: a.title,
      description,
      url: `/blog/${a.slug}`,
      publishedTime: a.publishedAt ?? undefined,
      images: a.image ? [a.image] : undefined,
    },
  };
}

export default async function ArticlePage({ params }: Props) {
  const a = await getArticle(params.slug);
  if (!a) notFound();

  const related = TOOLS_CATALOG.filter((t) => a.relatedToolSlugs.includes(t.slug));
  const ld = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: a.title,
    description: a.metaDescription || a.excerpt || undefined,
    datePublished: a.publishedAt ?? undefined,
    image: a.image ?? undefined,
    mainEntityOfPage: `${siteUrl}/blog/${a.slug}`,
    publisher: { '@type': 'Organization', name: 'BetMeter' },
  };

  return (
    <article className="relative max-w-3xl mx-auto w-full px-4 py-10 md:py-14">
      <nav className="text-xs text-muted-foreground mb-6 flex flex-wrap items-center gap-1.5 font-mono">
        <Link href="/blog" className="hover:text-brand">Blog</Link>
        <span>/</span>
        <span className="capitalize">{a.category.replace(/-/g, ' ')}</span>
      </nav>

      <h1 className="font-display text-3xl md:text-5xl font-bold leading-tight">{a.title}</h1>
      <p className="mt-4 flex items-center gap-4 text-xs font-mono text-muted-foreground">
        {a.publishedAt && (
          <time dateTime={a.publishedAt}>
            {new Date(a.publishedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
          </time>
        )}
        <span className="inline-flex items-center gap-1.5">
          <Clock className="h-3.5 w-3.5" /> {a.readingTime} min read
        </span>
      </p>

      <div className="mt-8">
        <Markdown>{a.content}</Markdown>
      </div>

      {related.length > 0 && (
        <aside className="mt-14 rounded-2xl border border-border bg-card p-6 shadow-card">
          <p className="font-mono text-xs uppercase tracking-[0.14em] text-brand mb-4">Try it yourself</p>
          <div className="space-y-3">
            {related.map((t) => (
              <Link key={t.slug} href={t.href} className="group flex items-center justify-between gap-4">
                <div>
                  <p className="font-display font-semibold">{t.shortTitle}</p>
                  <p className="text-sm text-muted-foreground">{t.tagline}</p>
                </div>
                <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition-all group-hover:translate-x-0.5 group-hover:text-brand" />
              </Link>
            ))}
          </div>
        </aside>
      )}

      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }} />
    </article>
  );
}
