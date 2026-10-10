'use client';

import { useState } from 'react';
import { Loader2, Search, Layers } from 'lucide-react';
import { PLATFORM_OPTIONS } from '@/lib/platformList';

interface SplitSelection {
  homeTeam: string;
  awayTeam: string;
  market: string;
  odds: number;
  score: number | null;
}
interface SplitGroup {
  label: string;
  selections: SplitSelection[];
  generatedCode: string | null;
  deepLink?: string | null;
}

const MODES: { value: 'risk' | 'even' | 'market'; label: string }[] = [
  { value: 'risk', label: 'By risk' },
  { value: 'even', label: 'Even split' },
  { value: 'market', label: 'By market type' },
];

function scoreColor(score: number | null): string {
  if (score === null) return 'text-muted-foreground';
  if (score >= 70) return 'text-[hsl(var(--verified))]';
  if (score >= 40) return 'text-amber-600';
  return 'text-[hsl(var(--rust))]';
}

export function SplitterForm() {
  const [platform, setPlatform] = useState('sportybet');
  const [code, setCode] = useState('');
  const [mode, setMode] = useState<'risk' | 'even' | 'market'>('risk');
  const [groupCount, setGroupCount] = useState(2);
  const [loading, setLoading] = useState(false);
  const [groups, setGroups] = useState<SplitGroup[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim()) return;

    setLoading(true);
    setError(null);
    setGroups(null);

    try {
      const res = await fetch('/api/splitter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ platform, code: code.trim(), mode, groupCount }),
      });
      const data = await res.json();

      if (data.error) {
        setError(data.error);
      } else {
        setGroups(data.groups);
      }
    } catch {
      setError('Something went wrong splitting that code. Try again in a moment.');
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
            className="mt-1 w-full rounded-sm border border-border bg-background px-3 py-2 text-sm"
          >
            {PLATFORM_OPTIONS.map((p) => (
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
          <input
            id="code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="e.g. P79BMH"
            className="mt-1 w-full h-10 rounded-sm border border-border bg-background px-3 text-sm font-mono uppercase"
          />
        </div>

        <div>
          <p className="text-xs font-mono uppercase tracking-wide text-muted-foreground mb-1.5">Split by</p>
          <div className="flex gap-2">
            {MODES.map((m) => (
              <button
                key={m.value}
                type="button"
                onClick={() => setMode(m.value)}
                className={`flex-1 h-9 rounded-sm text-xs font-semibold border transition-colors ${
                  mode === m.value
                    ? 'bg-[hsl(var(--ink))] text-[hsl(var(--paper))] border-[hsl(var(--ink))]'
                    : 'border-border hover:border-[hsl(var(--seal))]'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>

        {mode === 'even' && (
          <div>
            <label htmlFor="groupCount" className="text-xs font-mono uppercase tracking-wide text-muted-foreground">
              Number of slips
            </label>
            <input
              id="groupCount"
              type="number"
              min={2}
              max={10}
              value={groupCount}
              onChange={(e) => setGroupCount(parseInt(e.target.value) || 2)}
              className="mt-1 w-24 h-9 rounded-sm border border-border bg-background px-3 text-sm"
            />
          </div>
        )}

        <button
          type="submit"
          disabled={loading || !code.trim()}
          className="w-full h-10 rounded-sm bg-[hsl(var(--ink))] text-[hsl(var(--paper))] text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          Split slip
        </button>
      </form>

      {error && (
        <p className="mt-4 text-sm text-[hsl(var(--rust))] bg-[hsl(var(--rust))]/10 rounded-sm px-3 py-2">
          {error}
        </p>
      )}

      {groups && (
        <div className="mt-5 space-y-4">
          {groups.map((group, gi) => (
            <div key={gi} className="rounded-sm border border-border p-4">
              <div className="flex items-center justify-between gap-2 mb-2">
                <div className="flex items-center gap-1.5">
                  <Layers className="h-3.5 w-3.5 text-[hsl(var(--seal))]" />
                  <p className="text-xs font-mono uppercase tracking-wide">{group.label}</p>
                </div>
                <span className="text-xs font-mono text-muted-foreground min-w-0 break-words text-right">
                  {group.generatedCode ?? 'No code for this platform: re-enter these picks manually'}
                </span>
              </div>
              <div className="space-y-1.5">
                {group.selections.map((s, si) => (
                  <div key={si} className="flex items-center justify-between text-sm">
                    <span className="truncate min-w-0">
                      {s.homeTeam} v {s.awayTeam} — {s.market}
                    </span>
                    <span className="flex items-center gap-2 flex-shrink-0 ml-2">
                      <span className="text-xs font-mono">{s.odds.toFixed(2)}</span>
                      <span className={`text-xs font-mono font-semibold ${scoreColor(s.score)}`}>
                        {s.score ?? '—'}
                      </span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
