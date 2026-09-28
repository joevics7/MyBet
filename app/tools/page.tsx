import { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { TOOLS_CATALOG } from '@/lib/toolsData';

export const metadata: Metadata = {
  title: 'Tools — Decoder, Converter, Splitter & More',
  description: 'Every BetMeter tool in one place: booking code decoder, converter, splitter, odds comparison, vault, and stake calculator.',
};

export default function ToolsIndexPage() {
  return (
    <div className="max-w-6xl mx-auto px-4 py-14">
      <p className="text-xs uppercase tracking-[0.14em] font-mono text-[hsl(var(--verified))] mb-2">
        Tools
      </p>
      <h1 className="font-serif text-3xl md:text-4xl font-semibold">
        Every tool, one confidence engine
      </h1>
      <p className="mt-3 text-muted-foreground max-w-lg">
        Each tool below is built on the same Decode, Confidence, Encode, and Odds Lookup
        services — so a score you see in one tool matches what you&rsquo;d see anywhere else.
      </p>

      <div className="mt-10 grid sm:grid-cols-2 md:grid-cols-3 gap-5">
        {TOOLS_CATALOG.map((tool) => (
          <Link
            key={tool.slug}
            href={tool.href}
            className="group rounded-sm border border-border bg-card p-6 hover:border-[hsl(var(--seal))] transition-colors"
          >
            <div className="flex items-center justify-between">
              <p className="font-serif text-base font-semibold leading-snug">{tool.shortTitle}</p>
              {tool.status === 'soon' && (
                <span className="text-[10px] font-mono uppercase tracking-wide text-muted-foreground border border-border rounded-full px-2 py-0.5">
                  Coming soon
                </span>
              )}
            </div>
            <p className="mt-2 text-sm text-muted-foreground">{tool.tagline}</p>
            <span className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-[hsl(var(--verified))] opacity-0 group-hover:opacity-100 transition-opacity">
              Open <ArrowRight className="h-3 w-3" />
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
