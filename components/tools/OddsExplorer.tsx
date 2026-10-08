'use client';

import { useEffect, useMemo, useState } from 'react';
import { Loader2, Search } from 'lucide-react';
import type { MatchSummary, MarketTable } from '@/lib/services/oddsPapi';

const DAYS = 6;

function dayChips() {
  return Array.from({ length: DAYS }, (_, i) => {
    const d = new Date(Date.now() + i * 86400000);
    const label = i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : d.toLocaleDateString([], { weekday: 'short', day: 'numeric' });
    return { date: d.toISOString().slice(0, 10), label };
  });
}

const timeOf = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

export function OddsExplorer() {
  const chips = useMemo(dayChips, []);
  const [date, setDate] = useState(chips[0].date);
  const [query, setQuery] = useState('');
  const [matches, setMatches] = useState<MatchSummary[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);

  const [openId, setOpenId] = useState<string | null>(null);
  const [tables, setTables] = useState<MarketTable[] | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setListLoading(true);
    setListError(null);
    setOpenId(null);
    fetch(`/api/odds/matches?date=${date}`)
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        if (d.status === 'ok') setMatches(d.matches);
        else {
          setMatches([]);
          setListError(d.message ?? 'Something went wrong.');
        }
      })
      .catch(() => !cancelled && setListError('Network error. Please try again.'))
      .finally(() => !cancelled && setListLoading(false));
    return () => {
      cancelled = true;
    };
  }, [date]);

  async function openMatch(id: string) {
    if (openId === id) return setOpenId(null);
    setOpenId(id);
    setTables(null);
    setDetailError(null);
    setDetailLoading(true);
    try {
      const d = await (await fetch(`/api/odds/match?fixtureId=${encodeURIComponent(id)}`)).json();
      if (d.status === 'ok') setTables(d.markets);
      else setDetailError(d.message ?? 'Something went wrong.');
    } catch {
      setDetailError('Network error. Please try again.');
    } finally {
      setDetailLoading(false);
    }
  }

  const q = query.trim().toLowerCase();
  const shown = (q ? matches.filter((m) => `${m.home} ${m.away} ${m.league} ${m.country}`.toLowerCase().includes(q)) : matches).slice(0, 150);

  return (
    <div className="rounded-sm border border-border bg-card p-4 sm:p-6">
      <div className="flex gap-2 overflow-x-auto pb-2">
        {chips.map((c) => (
          <button
            key={c.date}
            onClick={() => setDate(c.date)}
            className={`shrink-0 rounded-sm border px-3 py-1.5 text-xs font-mono ${
              c.date === date ? 'border-[hsl(var(--ink))] bg-[hsl(var(--ink))] text-[hsl(var(--paper))]' : 'border-border'
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
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search team or league"
          className="w-full h-10 rounded-sm border border-border bg-background pl-9 pr-3 text-sm"
        />
      </div>

      {listLoading && (
        <p className="mt-6 flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading matches…
        </p>
      )}
      {listError && <p className="mt-4 text-sm text-red-600">{listError}</p>}
      {!listLoading && !listError && shown.length === 0 && (
        <p className="mt-4 text-sm text-muted-foreground">No matches found.</p>
      )}

      <ul className="mt-3 divide-y divide-border">
        {shown.map((m) => (
          <li key={m.fixtureId}>
            <button onClick={() => openMatch(m.fixtureId)} className="flex w-full items-center gap-3 py-3 text-left">
              <span className="w-12 shrink-0 font-mono text-xs text-muted-foreground">{timeOf(m.kickoff)}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">
                  {m.home} v {m.away}
                </span>
                <span className="block truncate text-[11px] text-muted-foreground">
                  {m.country ? `${m.country} · ` : ''}
                  {m.league}
                </span>
              </span>
            </button>

            {openId === m.fixtureId && (
              <div className="pb-4 space-y-4">
                {detailLoading && (
                  <p className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" /> Loading odds…
                  </p>
                )}
                {detailError && <p className="text-sm text-red-600">{detailError}</p>}
                {tables?.length === 0 && <p className="text-sm text-muted-foreground">No odds available yet.</p>}
                {tables?.map((t) => <Table key={t.key} table={t} />)}
                {tables && tables.length > 0 && (
                  <p className="text-[11px] text-muted-foreground">
                    Prices change fast and can lag. Confirm the odds on the bookmaker before you bet. Bookmakers are
                    sorted by margin, lowest first. Not every bookmaker is available in every country.
                  </p>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Table({ table }: { table: MarketTable }) {
  const top = table.rows.slice(0, 6);
  const rest = table.rows.slice(6);
  const gridStyle = { gridTemplateColumns: `minmax(0,1fr) repeat(${table.outcomes.length}, 3.5rem)` };

  const row = (r: MarketTable['rows'][number]) => (
    <div key={r.slug} style={gridStyle} className="grid items-center gap-1 py-1 text-sm">
      <span className="truncate text-muted-foreground">{r.label}</span>
      {r.prices.map((p, i) => (
        <span
          key={i}
          className={`text-right font-mono ${
            p !== null && p === table.best[i] ? 'font-semibold text-[hsl(var(--verified))]' : ''
          }`}
        >
          {p !== null ? p.toFixed(2) : '—'}
        </span>
      ))}
    </div>
  );

  return (
    <div className="rounded-sm border border-border p-3">
      <p className="text-xs font-mono uppercase tracking-wide text-muted-foreground">{table.title}</p>
      <div style={gridStyle} className="mt-2 grid gap-1 border-b border-border pb-1 text-[10px] font-mono uppercase text-muted-foreground">
        <span />
        {table.outcomes.map((o) => (
          <span key={o} className="text-right">
            {o}
          </span>
        ))}
      </div>
      {top.map(row)}
      {rest.length > 0 && (
        <details>
          <summary className="cursor-pointer pt-1 text-xs text-muted-foreground">Show {rest.length} more bookmakers</summary>
          {rest.map(row)}
        </details>
      )}
    </div>
  );
}
