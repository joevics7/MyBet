'use client';

import { useEffect, useMemo, useState } from 'react';
import { Loader2, Search } from 'lucide-react';
import { MARKETS, type DayMatch, type DayOdds, type MarketKey, type PlatformOdds } from '@/lib/odds/types';

const DAYS = 6;
const PAGE = 30;
const FIRST_ROWS = 4;

function dayChips() {
  return Array.from({ length: DAYS }, (_, i) => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() + i);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    const label = i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : start.toLocaleDateString([], { weekday: 'short', day: 'numeric' });
    return { label, from: start.toISOString(), to: end.toISOString() };
  });
}

const timeOf = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

function bestPrices(platforms: PlatformOdds[], key: MarketKey, width: number): (number | null)[] {
  return Array.from({ length: width }, (_, i) => {
    const vals = platforms.map((p) => p.odds[key]?.[i]).filter((v): v is number => typeof v === 'number');
    return vals.length ? Math.max(...vals) : null;
  });
}

export function OddsBoard() {
  const chips = useMemo(dayChips, []);
  const [day, setDay] = useState(0);
  const [data, setData] = useState<DayOdds | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(PAGE);

  useEffect(() => {
    const ctrl = new AbortController();
    setLoading(true);
    setError(null);
    setData(null);
    setLimit(PAGE);
    const { from, to } = chips[day];
    fetch(`/api/odds/day?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`, { signal: ctrl.signal })
      .then((r) => r.json())
      .then((d) => (d.status === 'ok' ? setData(d) : setError(d.message ?? 'Something went wrong.')))
      .catch((e) => e.name !== 'AbortError' && setError('Network error. Please try again.'))
      .finally(() => !ctrl.signal.aborted && setLoading(false));
    return () => ctrl.abort();
  }, [day, chips]);

  const q = query.trim().toLowerCase();
  const filtered = useMemo(
    () => (data ? (q ? data.matches.filter((m) => `${m.home} ${m.away} ${m.league} ${m.country}`.toLowerCase().includes(q)) : data.matches) : []),
    [data, q],
  );

  return (
    <div className="rounded-sm border border-border bg-card p-4 sm:p-6">
      <div className="flex gap-2 overflow-x-auto max-w-full min-w-0 pb-2">
        {chips.map((c, i) => (
          <button
            key={c.from}
            onClick={() => setDay(i)}
            className={`shrink-0 rounded-sm border px-3 py-1.5 text-xs font-mono ${
              i === day ? 'border-[hsl(var(--ink))] bg-[hsl(var(--ink))] text-[hsl(var(--paper))]' : 'border-border'
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>

      <div className="relative mt-2">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
        <input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setLimit(PAGE);
          }}
          placeholder="Search team or league"
          className="w-full h-10 rounded-sm border border-border bg-background pl-9 pr-3 text-sm"
        />
      </div>

      {loading && (
        <p className="mt-8 flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Gathering odds from the bookmakers…
        </p>
      )}
      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
      {data && !loading && filtered.length === 0 && (
        <p className="mt-4 text-sm text-muted-foreground">{q ? 'No matches found.' : 'No matches with odds for this day yet.'}</p>
      )}

      <div className="mt-3 space-y-3">
        {filtered.slice(0, limit).map((m) => (
          <MatchCard key={m.id} match={m} />
        ))}
      </div>

      {filtered.length > limit && (
        <button onClick={() => setLimit((l) => l + PAGE)} className="mt-4 w-full h-10 rounded-sm border border-border text-sm">
          Show more matches ({filtered.length - limit} left)
        </button>
      )}

      {data && (
        <div className="mt-6 space-y-2">
          <p className="text-[11px] text-muted-foreground">
            Prices change fast and can lag. Confirm the odds on the bookmaker before you bet. Not every bookmaker accepts
            customers in every country.
          </p>
          <details className="text-[11px] text-muted-foreground">
            <summary className="cursor-pointer">Data sources</summary>
            <ul className="mt-1 space-y-0.5">
              {data.sources.map((s) => (
                <li key={s.slug}>
                  {s.ok ? '✓' : '✗'} {s.label} ({s.role}){s.ok ? `: ${s.matches} matches` : s.note ? `: ${s.note}` : ''}
                </li>
              ))}
            </ul>
          </details>
        </div>
      )}
    </div>
  );
}

function MatchCard({ match }: { match: DayMatch }) {
  const withX2 = match.platforms.filter((p) => p.odds['1x2']);
  const shown = withX2.slice(0, FIRST_ROWS);
  const best = bestPrices(withX2, '1x2', 3);
  const hiddenCount = match.platforms.length - shown.length;
  const otherMarkets = MARKETS.filter((mk) => mk.key !== '1x2' && match.platforms.some((p) => p.odds[mk.key]));

  return (
    <div className="rounded-sm border border-border p-3">
      <div className="flex items-baseline justify-between gap-2">
        <p className="truncate text-sm font-medium">
          {match.home} v {match.away}
        </p>
        <span className="shrink-0 font-mono text-xs text-muted-foreground">{timeOf(match.kickoff)}</span>
      </div>
      <p className="truncate text-[11px] text-muted-foreground">
        {match.country ? `${match.country} · ` : ''}
        {match.league}
      </p>

      {shown.length > 0 && <Grid rows={shown} outcomes={['1', 'X', '2']} marketKey="1x2" best={best} />}

      {(hiddenCount > 0 || otherMarkets.length > 0) && (
        <details className="mt-2">
          <summary className="cursor-pointer text-xs text-muted-foreground">
            {hiddenCount > 0 ? `${hiddenCount} more bookmakers` : 'More markets'}
            {otherMarkets.length > 0 ? ' & markets' : ''}
          </summary>
          <div className="mt-2 space-y-3">
            {withX2.length > FIRST_ROWS && <Grid rows={withX2.slice(FIRST_ROWS)} outcomes={['1', 'X', '2']} marketKey="1x2" best={best} />}
            {otherMarkets.map((mk) => {
              const rows = match.platforms.filter((p) => p.odds[mk.key]);
              return (
                <div key={mk.key}>
                  <p className="text-[10px] font-mono uppercase tracking-wide text-muted-foreground">{mk.title}</p>
                  <Grid rows={rows} outcomes={mk.outcomes} marketKey={mk.key} best={bestPrices(rows, mk.key, mk.outcomes.length)} header />
                </div>
              );
            })}
          </div>
        </details>
      )}
    </div>
  );
}

function Grid({
  rows,
  outcomes,
  marketKey,
  best,
  header = true,
}: {
  rows: PlatformOdds[];
  outcomes: string[];
  marketKey: MarketKey;
  best: (number | null)[];
  header?: boolean;
}) {
  const style = { gridTemplateColumns: `minmax(0,1fr) repeat(${outcomes.length}, 3.25rem)` };
  return (
    <div className="mt-2">
      {header && (
        <div style={style} className="grid gap-1 border-b border-border pb-1 text-[10px] font-mono uppercase text-muted-foreground">
          <span />
          {outcomes.map((o) => (
            <span key={o} className="text-right">
              {o}
            </span>
          ))}
        </div>
      )}
      {rows.map((p) => (
        <div key={p.slug} style={style} className="grid items-center gap-1 py-0.5 text-sm">
          <span className="truncate text-muted-foreground">{p.label}</span>
          {outcomes.map((_, i) => {
            const v = p.odds[marketKey]?.[i] ?? null;
            return (
              <span
                key={i}
                className={`text-right font-mono ${v !== null && v === best[i] ? 'font-semibold text-[hsl(var(--verified))]' : ''}`}
              >
                {v !== null ? v.toFixed(2) : '—'}
              </span>
            );
          })}
        </div>
      ))}
    </div>
  );
}
