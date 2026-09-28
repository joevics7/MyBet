'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Clock3 } from 'lucide-react';

interface CountryOption {
  slug: string;
  name: string;
  flag_emoji: string | null;
}

interface ScholarshipRow {
  slug: string;
  title: string;
  summary: string | null;
  level: string | null;
  funding_type: string | null;
  deadline: string | null;
  is_closed: boolean;
  countries?: { slug: string; name: string; flag_emoji: string | null } | null;
}

const LEVELS = [
  { value: 'undergraduate', label: 'Undergraduate' },
  { value: 'masters', label: 'Masters' },
  { value: 'phd', label: 'PhD' },
  { value: 'postdoc', label: 'Postdoc' },
  { value: 'any', label: 'Any level' },
];

const FUNDING_TYPES = [
  { value: 'full', label: 'Fully funded' },
  { value: 'partial', label: 'Partial funding' },
  { value: 'tuition_only', label: 'Tuition only' },
  { value: 'stipend_only', label: 'Stipend only' },
];

function daysUntil(dateStr: string) {
  const diff = Math.ceil((new Date(dateStr).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  return diff;
}

export function ScholarshipsBrowser({
  countries,
  scholarships,
  initialCountry = 'all',
  initialLevel = 'all',
  initialFunding = 'all',
}: {
  countries: CountryOption[];
  scholarships: ScholarshipRow[];
  initialCountry?: string;
  initialLevel?: string;
  initialFunding?: string;
}) {
  const [query, setQuery] = useState('');
  const [country, setCountry] = useState(initialCountry);
  const [level, setLevel] = useState(initialLevel);
  const [funding, setFunding] = useState(initialFunding);

  const filtered = useMemo(() => {
    return scholarships.filter((s) => {
      if (country !== 'all' && s.countries?.slug !== country) return false;
      if (level !== 'all' && s.level !== level) return false;
      if (funding !== 'all' && s.funding_type !== funding) return false;
      if (query && !s.title.toLowerCase().includes(query.toLowerCase())) return false;
      return true;
    });
  }, [scholarships, query, country, level, funding]);

  return (
    <div>
      <div className="flex flex-col sm:flex-row gap-3">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search scholarships…"
          className="flex-1 rounded-sm border border-border px-3 py-2.5 text-sm bg-card"
        />
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
          value={level}
          onChange={(e) => setLevel(e.target.value)}
          className="rounded-sm border border-border px-3 py-2.5 text-sm bg-card"
        >
          <option value="all">All levels</option>
          {LEVELS.map((l) => (
            <option key={l.value} value={l.value}>
              {l.label}
            </option>
          ))}
        </select>
        <select
          value={funding}
          onChange={(e) => setFunding(e.target.value)}
          className="rounded-sm border border-border px-3 py-2.5 text-sm bg-card"
        >
          <option value="all">All funding types</option>
          {FUNDING_TYPES.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>
      </div>

      <div className="mt-8">
        {filtered.length === 0 ? (
          <div className="border border-dashed border-border rounded-sm p-10 text-center">
            <p className="text-sm text-muted-foreground">
              Scholarships are being researched and verified against official sources before
              they go live here — check back soon.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border border-t border-border">
            {filtered.map((s) => {
              const days = s.deadline ? daysUntil(s.deadline) : null;
              return (
                <Link
                  key={s.slug}
                  href={`/scholarships/scholarship/${s.slug}`}
                  className="group flex items-center justify-between gap-4 py-5 hover:bg-muted/40 -mx-2 px-2 transition-colors"
                >
                  <div>
                    <p className="text-xs font-mono text-muted-foreground">
                      {s.countries ? `${s.countries.flag_emoji} ${s.countries.name}` : 'Global'}
                      {s.level && ` · ${LEVELS.find((l) => l.value === s.level)?.label}`}
                      {s.funding_type && ` · ${FUNDING_TYPES.find((f) => f.value === s.funding_type)?.label}`}
                    </p>
                    <h3 className="font-serif text-base font-semibold mt-1">{s.title}</h3>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    {s.is_closed ? (
                      <span className="text-[10px] uppercase tracking-wide font-mono text-muted-foreground border border-border rounded-full px-2 py-1">
                        Closed
                      </span>
                    ) : days !== null && days >= 0 ? (
                      <span className="flex items-center gap-1 text-[10px] uppercase tracking-wide font-mono text-[hsl(var(--rust))] border border-[hsl(var(--rust))]/40 rounded-full px-2 py-1">
                        <Clock3 className="h-3 w-3" /> {days}d left
                      </span>
                    ) : null}
                    <ArrowRight className="h-4 w-4 text-[hsl(var(--verified))] opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
