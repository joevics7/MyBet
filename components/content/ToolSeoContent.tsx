import { getToolContent } from '@/lib/services/content';
import { Markdown } from '@/components/content/Markdown';

/** Writer-managed SEO section rendered under a tool (from tool_translations). */
export async function ToolSeoContent({ slug }: { slug: string }) {
  const c = await getToolContent(slug);
  if (!c || (!c.articleBody && c.faq.length === 0)) return null;

  const faqLd =
    c.faq.length > 0
      ? {
          '@context': 'https://schema.org',
          '@type': 'FAQPage',
          mainEntity: c.faq.map((f) => ({
            '@type': 'Question',
            name: f.question,
            acceptedAnswer: { '@type': 'Answer', text: f.answer },
          })),
        }
      : null;

  return (
    <section className="mt-16 border-t border-border pt-10 max-w-3xl">
      {c.articleTitle && (
        <h2 className="font-display text-2xl md:text-3xl font-bold">{c.articleTitle}</h2>
      )}
      {(c.lastUpdated || c.reviewerName) && (
        <p className="mt-2 text-xs font-mono text-muted-foreground">
          {c.lastUpdated && (
            <>
              Last updated{' '}
              {new Date(c.lastUpdated).toLocaleDateString('en-GB', {
                day: 'numeric',
                month: 'long',
                year: 'numeric',
              })}
            </>
          )}
          {c.lastUpdated && c.reviewerName && ' · '}
          {c.reviewerName && <>Reviewed by {c.reviewerName}</>}
          {c.sourceUrl && (
            <>
              {' · '}
              <a href={c.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-brand hover:underline">
                Source
              </a>
            </>
          )}
        </p>
      )}
      {c.articleBody && (
        <div className="mt-6">
          <Markdown>{c.articleBody}</Markdown>
        </div>
      )}
      {c.contentAddition && (
        <div className="mt-6">
          <Markdown>{c.contentAddition}</Markdown>
        </div>
      )}
      {c.faq.length > 0 && (
        <div className="mt-10">
          <h3 className="font-display text-xl font-semibold mb-4">Frequently asked questions</h3>
          <div className="space-y-3">
            {c.faq.map((f) => (
              <details key={f.question} className="group rounded-xl border border-border bg-card px-4 py-3">
                <summary className="cursor-pointer font-medium list-none flex items-center justify-between gap-3">
                  {f.question}
                  <span className="text-brand transition-transform group-open:rotate-45">+</span>
                </summary>
                <p className="mt-2 text-sm text-muted-foreground">{f.answer}</p>
              </details>
            ))}
          </div>
        </div>
      )}
      {faqLd && (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd) }} />
      )}
    </section>
  );
}
