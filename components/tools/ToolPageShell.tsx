import Link from 'next/link';
import { ReactNode } from 'react';

interface FaqItem {
  question: string;
  answer: string;
}

interface ToolPageShellProps {
  title: string;
  tagline: string;
  status: 'live' | 'soon';
  body: ReactNode;
  howItWorks?: ReactNode;
  faq?: FaqItem[];
}

export function ToolPageShell({ title, tagline, status, body, howItWorks, faq = [] }: ToolPageShellProps) {
  return (
    <div className="max-w-6xl mx-auto px-4 py-10">
      <nav className="text-xs text-muted-foreground mb-6 flex items-center gap-1.5 font-mono">
        <Link href="/tools" className="hover:text-[hsl(var(--verified))]">Tools</Link>
        <span>/</span>
        <span className="text-foreground">{title}</span>
      </nav>

      <div className="grid md:grid-cols-[1.15fr_1fr] gap-10">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <p className="text-xs uppercase tracking-[0.14em] font-mono text-[hsl(var(--verified))]">
              BetMeter tool
            </p>
            {status === 'soon' && (
              <span className="text-[10px] font-mono uppercase tracking-wide text-muted-foreground border border-border rounded-full px-2 py-0.5">
                Coming soon
              </span>
            )}
          </div>
          <h1 className="font-serif text-3xl md:text-4xl font-semibold leading-tight">{title}</h1>
          <p className="mt-3 text-muted-foreground max-w-lg">{tagline}</p>

          {howItWorks && (
            <div className="mt-8 prose prose-sm max-w-none prose-headings:font-serif prose-headings:font-semibold">
              <h2 className="font-serif text-xl font-semibold">How it works</h2>
              {howItWorks}
            </div>
          )}

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
          <div className="md:sticky md:top-24">{body}</div>
        </div>
      </div>
    </div>
  );
}
