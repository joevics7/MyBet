'use client';

import { useState } from 'react';
import { Loader2, Search, CheckCircle2, XCircle, MinusCircle } from 'lucide-react';
import type { DecodeResult, NormalizedSelection } from '@/lib/services/types';

const PLATFORMS = [
  { slug: 'sportybet', label: 'SportyBet' },
  { slug: 'bet9ja', label: 'Bet9ja' },
];

function ResultIcon({ selection }: { selection: NormalizedSelection }) {
  if (selection.isWinning === true) {
    return <CheckCircle2 className="h-4 w-4 text-[hsl(var(--verified))] flex-shrink-0" />;
  }
  if (selection.isWinning === false) {
    return <XCircle className="h-4 w-4 text-[hsl(var(--rust))] flex-shrink-0" />;
  }
  return <MinusCircle className="h-4 w-4 text-muted-foreground flex-shrink-0" />;
}

function scoreColor(score: number | null | undefined): string {
  if (score === null || score === undefined) return 'text-muted-foreground';
  if (score >= 70) return 'text-[hsl(var(--verified))]';
  if (score >= 40) return 'text-amber-600';
  return 'text-[hsl(var(--rust))]';
}

export function DecoderForm() {
  const [platform, setPlatform] = useState(PLATFORMS[0].slug);
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<DecodeResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim()) return;

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch('/api/decode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ platform, code: code.trim() }),
      });
      const data: DecodeResult = await res.json();

      if (data.status !== 'ok') {
        setError(
          data.status === 'unsupported_platform'
            ? "That platform isn't supported yet."
            : "Couldn't find that code — check it's correct and try again.",
        );
      } else {
        setResult(data);
      }
    } catch {
      setError('Something went wrong reaching the decoder. Try again in a moment.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-sm border border-border bg-card p-6">
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label htmlFor="platform" className="text-xs font-mono uppercase tracking-wide text-muted-foreground">
            Platform
          </label>
          <select
            id="platform"
            value={platform}
            onChange={(e) => setPlatform(e.target.value)}
            className="mt-1 w-full h-10 rounded-sm border border-border bg-background px-3 text-sm"
          >
            {PLATFORMS.map((p) => (
              <option key={p.slug} value={p.slug}>
                {p.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="code" className="text-xs font-mono uppercase tracking-wide text-muted-foreground">
            Booking code
          </label>
          <div className="mt-1 flex gap-2">
            <input
              id="code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="e.g. P79BMH"
              className="flex-1 h-10 rounded-sm border border-border bg-background px-3 text-sm font-mono uppercase"
            />
            <button
              type="submit"
              disabled={loading || !code.trim()}
              className="h-10 px-4 rounded-sm bg-[hsl(var(--ink))] text-[hsl(var(--paper))] text-sm font-semibold disabled:opacity-50 flex items-center gap-2"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              Decode
            </button>
          </div>
        </div>
      </form>

      {loading && (
        <p className="mt-3 text-xs text-muted-foreground">
          Decoding and scoring each selection — this can take a few seconds.
        </p>
      )}

      {error && (
        <p className="mt-4 text-sm text-[hsl(var(--rust))] bg-[hsl(var(--rust))]/10 rounded-sm px-3 py-2">
          {error}
        </p>
      )}

      {result && result.status === 'ok' && (
        <div className="mt-5 space-y-2">
          <div className="flex items-center justify-between text-xs font-mono uppercase tracking-wide text-muted-foreground">
            <span>{result.selections.length} selections</span>
            {result.totalOdds && <span>Total odds: {result.totalOdds}</span>}
          </div>
          {result.selections.map((s, i) => (
            <div key={i} className="rounded-sm border border-border px-3.5 py-2.5">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm truncate">
                    {s.homeTeam} v {s.awayTeam}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">{s.market}</p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="text-xs font-mono text-muted-foreground">{s.odds.toFixed(2)}</span>
                  <ResultIcon selection={s} />
                </div>
              </div>

              <div className="mt-2 pt-2 border-t border-border/60 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">BetMeter Score</span>
                  <span className={`text-xs font-mono font-semibold ${scoreColor(s.score)}`}>
                    {s.score ?? '—'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">
                    Tipster Score
                    {s.tipsterSources && s.tipsterSources.length > 0 && (
                      <span className="text-muted-foreground/70"> ({s.tipsterSources.join(', ')})</span>
                    )}
                  </span>
                  <span className={`text-xs font-mono font-semibold ${scoreColor(s.tipsterScore)}`}>
                    {s.tipsterScore ?? '—'}
                  </span>
                </div>
              </div>
            </div>
          ))}
          <p className="text-[11px] text-muted-foreground pt-1">
            Two independent scores (0-100), never combined: BetMeter Score is our own model;
            Tipster Score is an average of outside prediction sites. &ldquo;—&rdquo; means that
            source doesn&rsquo;t cover this fixture — not a 0.
          </p>
        </div>
      )}
    </div>
  );
}
