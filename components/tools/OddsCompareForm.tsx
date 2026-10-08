'use client';

import { useState } from 'react';
import { Loader2, Scale } from 'lucide-react';
import type { OddsComparison } from '@/lib/services/oddsCompare';

// Client-safe: only platforms that share SportyBet's IDs can be compared.
const SOURCES = [
  { slug: 'sportybet', label: 'SportyBet' },
  { slug: 'footballcom', label: 'Football.com' },
  { slug: 'msport', label: 'MSport' },
];

export function OddsCompareForm() {
  const [platform, setPlatform] = useState('sportybet');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<OddsComparison | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch('/api/odds-compare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ platform, code: code.trim() }),
      });
      const data = await res.json();
      if (data.status === 'ok') setResult(data.comparison);
      else setError(data.message ?? data.error ?? 'Something went wrong.');
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  const label = (slug: string) => result?.platforms.find((p) => p.slug === slug)?.label ?? slug;
  const best = result?.platforms.find((p) => p.slug === result.recommendedSlug);
  const source = result?.platforms.find((p) => p.slug === result.source.slug);

  return (
    <div className="rounded-sm border border-border bg-card p-6">
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label htmlFor="oc-platform" className="text-xs font-mono uppercase tracking-wide text-muted-foreground">
            Your code is from
          </label>
          <select
            id="oc-platform"
            value={platform}
            onChange={(e) => setPlatform(e.target.value)}
            className="mt-1 w-full rounded-sm border border-border bg-background px-3 py-2 text-sm"
          >
            {SOURCES.map((p) => (
              <option key={p.slug} value={p.slug}>
                {p.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="oc-code" className="text-xs font-mono uppercase tracking-wide text-muted-foreground">
            Booking code
          </label>
          <input
            id="oc-code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="e.g. P79BMH"
            className="mt-1 w-full h-10 rounded-sm border border-border bg-background px-3 text-sm font-mono uppercase"
          />
        </div>
        <button
          type="submit"
          disabled={loading || !code.trim()}
          className="w-full h-10 rounded-sm bg-[hsl(var(--ink))] text-[hsl(var(--paper))] text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Scale className="h-4 w-4" />}
          {loading ? 'Checking prices…' : 'Compare odds'}
        </button>
      </form>

      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

      {result && (
        <div className="mt-6 space-y-4">
          <div className="rounded-sm border border-border p-4">
            {best && source && best.slug !== source.slug && best.totalOdds !== null && source.totalOdds !== null ? (
              <p className="text-sm">
                <span className="font-semibold">{best.label}</span> pays the most for this whole slip:{' '}
                <span className="font-mono">{best.totalOdds}</span> vs{' '}
                <span className="font-mono">{source.totalOdds}</span> on {source.label}.
              </p>
            ) : best ? (
              <p className="text-sm">
                <span className="font-semibold">{best.label}</span> already has the best total for this slip (
                <span className="font-mono">{best.totalOdds}</span>).
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">
                No platform could price every pick, so there's no single best slip. See each pick below.
              </p>
            )}
            <div className="mt-3 grid grid-cols-3 gap-2">
              {result.platforms.map((p) => (
                <div
                  key={p.slug}
                  className={`rounded-sm border px-2 py-2 text-center ${
                    p.slug === result.recommendedSlug ? 'border-[hsl(var(--verified))]' : 'border-border'
                  }`}
                >
                  <p className="text-[10px] font-mono uppercase text-muted-foreground">{p.label}</p>
                  <p className="font-mono text-sm font-semibold">{p.totalOdds ?? '—'}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {p.coveredLegs}/{p.totalLegs} picks
                  </p>
                </div>
              ))}
            </div>
          </div>

          {result.truncated && (
            <p className="text-xs text-muted-foreground">Only the first 12 picks were compared.</p>
          )}

          <ul className="space-y-3">
            {result.legs.map((leg, i) => (
              <li key={i} className="rounded-sm border border-border p-3">
                <p className="text-sm font-medium">
                  {leg.homeTeam} v {leg.awayTeam}
                </p>
                <p className="text-xs text-muted-foreground">{leg.market}</p>
                <div className="mt-2 space-y-1">
                  {Object.entries(leg.quotes).map(([slug, q]) => (
                    <div key={slug} className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">{label(slug)}</span>
                      <span
                        className={`font-mono ${
                          slug === leg.bestSlug ? 'font-semibold text-[hsl(var(--verified))]' : ''
                        } ${q.odds === null || q.locked ? 'text-muted-foreground' : ''}`}
                      >
                        {q.odds !== null ? q.odds.toFixed(2) : '—'}
                        {q.reason && <span className="ml-1.5 text-[10px] font-sans">({q.reason})</span>}
                      </span>
                    </div>
                  ))}
                </div>
                {leg.gainPct !== null && leg.gainPct > 0 && leg.bestSlug && (
                  <p className="mt-2 text-xs text-[hsl(var(--verified))]">
                    +{leg.gainPct}% better on {label(leg.bestSlug)}
                  </p>
                )}
              </li>
            ))}
          </ul>
          <p className="text-[11px] text-muted-foreground">
            Prices are checked live and can change. Always confirm the odds on the platform before you bet.
          </p>
        </div>
      )}
    </div>
  );
}
