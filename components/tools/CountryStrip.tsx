import Link from 'next/link';

interface CountryOption {
  slug: string;
  name: string;
  flag_emoji: string | null;
  is_live: boolean;
}

export function CountryStrip({
  countries,
  basePath = '/tools',
}: {
  countries: CountryOption[];
  basePath?: string;
}) {
  return (
    <div className="flex items-center gap-2 overflow-x-auto hide-scrollbar pb-1">
      {countries.map((c) => (
        <Link
          key={c.slug}
          href={`${basePath}?country=${c.slug}`}
          className={`shrink-0 flex items-center gap-1.5 rounded-full border px-3.5 py-2 text-sm font-medium transition-colors ${
            c.is_live
              ? 'border-border hover:border-[hsl(var(--seal))] hover:bg-[hsl(var(--seal))]/10'
              : 'border-border/60 text-muted-foreground'
          }`}
        >
          <span>{c.flag_emoji}</span>
          {c.name}
          {!c.is_live && (
            <span className="text-[9px] uppercase tracking-wide font-mono text-muted-foreground/70">
              soon
            </span>
          )}
        </Link>
      ))}
    </div>
  );
}
