import Link from 'next/link';
import { ReactNode } from 'react';

interface FaqItem {
  question: string;
  answer: string;
}

interface ToolPageShellProps {
  country: { name: string; flag: string; slug: string };
  category: string;
  title: string;
  tagline: string;
  calculator: ReactNode;
  howItWorks: ReactNode;
  faq: FaqItem[];
  officialSourceName: string;
  officialSourceUrl: string;
  lastReviewed: string;
}

export function ToolPageShell({
  country,
  category,
  title,
  tagline,
  calculator,
  howItWorks,
  faq,
  officialSourceName,
  officialSourceUrl,
  lastReviewed,
}: ToolPageShellProps) {
  return (
    <div className="max-w-6xl mx-auto px-4 py-10">
      <nav className="text-xs text-muted-foreground mb-6 flex items-center gap-1.5 font-mono">
        <Link href="/tools" className="hover:text-[hsl(var(--verified))]">Tools</Link>
        <span>/</span>
        <Link href={`/tools?country=${country.slug}`} className="hover:text-[hsl(var(--verified))]">
          {country.flag} {country.name}
        </Link>
        <span>/</span>
        <span className="text-foreground">{title}</span>
      </nav>

      <div className="grid md:grid-cols-[1.15fr_1fr] gap-10">
        <div>
          <p className="text-xs uppercase tracking-[0.14em] font-mono text-[hsl(var(--verified))] mb-2">
            {country.flag} {country.name} &middot; {category}
          </p>
          <h1 className="font-serif text-3xl md:text-4xl font-semibold leading-tight">{title}</h1>
          <p className="mt-3 text-muted-foreground max-w-lg">{tagline}</p>

          <div className="mt-8 prose prose-sm max-w-none prose-headings:font-serif prose-headings:font-semibold">
            <h2 className="font-serif text-xl font-semibold">How it works</h2>
            {howItWorks}
          </div>

          {faq.length > 0 && (
            <div className="mt-10">
              <h2 className="font-serif text-xl font-semibold mb-3">FAQ</h2>
              <dl className="divide-y divide-border border-t border-border">
                {faq.map((f) => (
                  <div key={f.question} className="py-4">
                    <dt className="font-medium">{f.question}</dt>
                    <dd className="mt-1.5 text-sm text-muted-foreground">{f.answer}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}
        </div>

        <div>
          <div className="md:sticky md:top-24">
            {calculator}
            <div className="mt-4 rounded-sm border border-border bg-muted/40 px-4 py-3 text-xs text-muted-foreground">
              <p>
                Sourced from{' '}
                <a
                  href={officialSourceUrl}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="text-[hsl(var(--verified))] font-medium hover:underline"
                >
                  {officialSourceName}
                </a>
                . Last reviewed <span className="font-mono">{lastReviewed}</span>.
              </p>
              <p className="mt-2">
                Figures are estimates for planning. Always confirm with the official source before relying on a result.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
