'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Search } from 'lucide-react';
import { TOOLS_CATALOG } from '@/lib/toolsData';

interface Option {
  slug: string;
  name: string;
  flag_emoji?: string | null;
}

interface ToolsBrowserProps {
  countries: Option[];
  categories: Option[];
  initialQuery?: string;
  initialCategory?: string;
  initialCountry?: string;
}

export function ToolsBrowser({
  countries,
  categories,
  initialQuery = '',
  initialCategory = 'all',
  initialCountry = 'all',
}: ToolsBrowserProps) {
  const [query, setQuery] = useState(initialQuery);
  const [country, setCountry] = useState(initialCountry);
  const [category, setCategory] = useState(initialCategory);

  const filtered = useMemo(() => {
    return TOOLS_CATALOG.filter((t) => {
      if (country !== 'all' && t.countrySlug !== country) return false;
      if (category !== 'all' && t.categorySlug !== category) return false;
      if (query && !t.title.toLowerCase().includes(query.toLowerCase())) return false;
      return true;
    });
  }, [query, country, category]);

  const countryName = (slug: string) => countries.find((c) => c.slug === slug)?.name ?? slug;
  const categoryName = (slug: string) => categories.find((c) => c.slug === slug)?.name ?? slug;

  return (
    <div>
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search tools…"
            className="w-full rounded-sm border border-border pl-9 pr-3 py-2.5 text-sm bg-card"
          />
        </div>
        <select
          value={country}
          onChange={(e) => setCountry(e.target.value)}
          className="rounded-sm border border-border px-3 py-2.5 text-sm bg-card"
        >
          <option value="all">All countries</option>
          {countries.map((c) => (
            <option key={c.slug} value={c.slug}>
              {c.flag_emoji} {c.name}
            </option>
          ))}
        </select>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="rounded-sm border border-border px-3 py-2.5 text-sm bg-card"
        >
          <option value="all">All categories</option>
          {categories.map((c) => (
            <option key={c.slug} value={c.slug}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      <div className="mt-8">
        {filtered.length === 0 ? (
          <div className="border border-dashed border-border rounded-sm p-10 text-center">
            <p className="text-sm text-muted-foreground">
              No tools live yet for this filter — more are being verified and added country by country.
            </p>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 gap-4">
            {filtered.map((tool) => (
              <Link
                key={tool.href}
                href={tool.href}
                className="group rounded-sm border border-border bg-card p-5 hover:border-[hsl(var(--seal))] transition-colors"
              >
                <p className="text-xs font-mono text-muted-foreground">
                  {countryName(tool.countrySlug)} &middot; {categoryName(tool.categorySlug)}
                </p>
                <h3 className="font-serif text-lg font-semibold mt-1.5">{tool.title}</h3>
                <p className="mt-1.5 text-sm text-muted-foreground">{tool.tagline}</p>
                <span className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-[hsl(var(--verified))] opacity-0 group-hover:opacity-100 transition-opacity">
                  Open tool <ArrowRight className="h-3 w-3" />
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
