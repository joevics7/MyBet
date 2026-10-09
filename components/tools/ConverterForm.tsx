'use client';

import { useState } from 'react';
import { ArrowRight, CheckCircle2, Copy, ExternalLink, Loader2, MinusCircle, XCircle } from 'lucide-react';
import { CONVERT_TARGETS, PLATFORM_OPTIONS } from '@/lib/platformList';
import type { ConvertResult } from '@/lib/converter/convert';

const FILTERS = [
  { value: '', label: 'Off' },
  { value: '40', label: '40%+' },
  { value: '50', label: '50%+' },
  { value: '60', label: '60%+' },
];

export function ConverterForm() {
  const [source, setSource] = useState('sportybet');
  const [target, setTarget] = useState('betway');
  const [code, setCode] = useState('');
  const [dropStarted, setDropStarted] = useState(true);
  const [minScore, setMinScore] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ConvertResult | null>(null);
  const [copied, setCopied] = useState(false);

  const same = source === target;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim() || same) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch('/api/convert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source, target, code: code.trim(), dropStarted, minScore: minScore ? Number(minScore) : null }),
      });
      const data = await res.json();
      if (data.status === 'ok') setResult(data);
      else setError(data.message ?? data.error ?? 'Something went wrong.');
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable: the code is selectable on screen */
    }
  }

  const select = 'mt-1 w-full rounded-sm border border-border bg-background px-3 py-2 text-sm';
  const label = 'text-xs font-mono uppercase tracking-wide text-muted-foreground';

  return (
    <div className="rounded-sm border border-border bg-card p-6">
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2">
          <div>
            <label htmlFor="cv-source" className={label}>From</label>
            <select id="cv-source" value={source} onChange={(e) => setSource(e.target.value)} className={select}>
              {PLATFORM_OPTIONS.map((p) => (
                <option key={p.slug} value={p.slug}>{p.label}</option>
              ))}
            </select>
          </div>
          <ArrowRight className="mb-2.5 h-4 w-4 text-muted-foreground" />
          <div>
            <label htmlFor="cv-target" className={label}>To</label>
            <select id="cv-target" value={target} onChange={(e) => setTarget(e.target.value)} className={select}>
              {CONVERT_TARGETS.map((p) => (
                <option key={p.slug} value={p.slug}>{p.label}</option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label htmlFor="cv-code" className={label}>Booking code</label>
          <input
            id="cv-code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="Paste the code to convert"
            className="mt-1 w-full h-10 rounded-sm border border-border bg-background px-3 text-sm font-mono"
          />
        </div>

        <fieldset className="rounded-sm border border-border p-3 space-y-3">
          <legend className={`px-1 ${label}`}>Smart filter</legend>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={dropStarted} onChange={(e) => setDropStarted(e.target.checked)} />
            Remove games that have already started
          </label>
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm">Remove picks below this confidence</span>
            <select value={minScore} onChange={(e) => setMinScore(e.target.value)} className="rounded-sm border border-border bg-background px-2 py-1 text-sm">
              {FILTERS.map((f) => (
                <option key={f.value} value={f.value}>{f.label}</option>
              ))}
            </select>
          </div>
          {minScore && <p className="text-[11px] text-muted-foreground">Picks we can't score are kept. Scoring adds a few seconds.</p>}
        </fieldset>

        {same && <p className="text-xs text-red-600">Choose two different platforms.</p>}
        <button
          type="submit"
          disabled={loading || !code.trim() || same}
          className="w-full h-10 rounded-sm bg-[hsl(var(--ink))] text-[hsl(var(--paper))] text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
        >
          {loading && <Loader2 className="h-4 w-4 animate-spin" />}
          {loading ? 'Converting…' : 'Convert code'}
        </button>
      </form>

      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

      {result && (
        <div className="mt-6 space-y-4">
          {result.newCode ? (
            <div className="rounded-sm border border-[hsl(var(--verified))] p-4 text-center">
              <p className={label}>Your {result.target.label} code</p>
              <p className="mt-1 select-all font-mono text-2xl font-semibold tracking-wider">{result.newCode}</p>
              <div className="mt-3 flex justify-center gap-2">
                <button onClick={() => copy(result.newCode!)} className="flex items-center gap-1.5 rounded-sm border border-border px-3 py-1.5 text-xs">
                  <Copy className="h-3.5 w-3.5" /> {copied ? 'Copied' : 'Copy'}
                </button>
                {result.deepLink && (
                  <a href={result.deepLink} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 rounded-sm border border-border px-3 py-1.5 text-xs">
                    <ExternalLink className="h-3.5 w-3.5" /> Open on {result.target.label}
                  </a>
                )}
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                {result.convertedCount} of {result.totalLegs} picks converted
                {result.targetTotal !== null && result.sourceTotal !== null && (
                  <> · total odds <span className="font-mono">{result.sourceTotal}</span> → <span className="font-mono">{result.targetTotal}</span></>
                )}
              </p>
            </div>
          ) : (
            <div className="rounded-sm border border-border p-4 text-sm">
              We couldn't create a {result.target.label} code, because none of the picks could be matched. The reasons are listed below.
            </div>
          )}

          {result.convertedCount < result.totalLegs && result.newCode && (
            <p className="text-xs text-muted-foreground">
              This code has fewer picks than the original. Check the list below before you bet.
            </p>
          )}

          <ul className="space-y-2">
            {result.legs.map((l, i) => (
              <li key={i} className="flex items-start gap-2.5 rounded-sm border border-border p-3">
                {l.status === 'converted' ? (
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[hsl(var(--verified))]" />
                ) : l.status === 'dropped' ? (
                  <MinusCircle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                ) : (
                  <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{l.homeTeam} v {l.awayTeam}</p>
                  <p className="text-xs text-muted-foreground">{l.market}</p>
                  {l.reason && <p className="mt-0.5 text-xs text-muted-foreground">{l.reason}</p>}
                </div>
                <div className="shrink-0 text-right font-mono text-xs">
                  <p>{l.sourceOdds.toFixed(2)}</p>
                  {l.status === 'converted' && l.targetOdds !== null && (
                    <p className={l.targetOdds >= l.sourceOdds ? 'text-[hsl(var(--verified))]' : 'text-muted-foreground'}>
                      → {l.targetOdds.toFixed(2)}
                    </p>
                  )}
                  {l.score !== null && <p className="text-muted-foreground">{l.score}%</p>}
                </div>
              </li>
            ))}
          </ul>
          {result.truncated && <p className="text-xs text-muted-foreground">Only the first 20 picks were converted.</p>}
          <p className="text-[11px] text-muted-foreground">
            Odds can differ between platforms and change before kickoff. Check the slip on {result.target.label} before you bet.
          </p>
        </div>
      )}
    </div>
  );
}
