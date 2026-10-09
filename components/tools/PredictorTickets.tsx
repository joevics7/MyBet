'use client';

import { useState } from 'react';
import { CheckCircle2, Copy, ExternalLink } from 'lucide-react';

export interface PredictorSelection {
  home_team: string;
  away_team: string;
  competition: string | null;
  market: string;
  score: number;
  model_odds: number;
  book_odds?: number | null;
  book_name?: string | null;
  model_probability?: number | null;
  reason: string | null;
  kickoff_at: string | null;
}

export interface BookingCode {
  slug: string;
  label: string;
  code: string;
  deepLink: string | null;
  totalOdds: number | null;
}

export interface PredictorTicket {
  id: string;
  target_band: number;
  combined_odds: number;
  avg_confidence: number;
  odds_basis?: 'bookmaker' | 'model' | null;
  booking_codes?: BookingCode[] | null;
  selections: PredictorSelection[];
}

function scoreColor(score: number): string {
  if (score >= 70) return 'text-[hsl(var(--verified))]';
  if (score >= 40) return 'text-amber-600';
  return 'text-[hsl(var(--rust))]';
}

function CodeRow({ c }: { c: BookingCode }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(c.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable: the code is selectable on screen */
    }
  }
  return (
    <div className="flex items-center justify-between gap-2 py-1.5">
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">
          {c.label}
          {c.totalOdds ? <span className="font-mono"> &middot; odds {Number(c.totalOdds).toFixed(2)}</span> : null}
        </p>
        <p className="select-all font-mono text-sm font-semibold tracking-wider">{c.code}</p>
      </div>
      <div className="flex shrink-0 gap-1.5">
        <button onClick={copy} className="flex items-center gap-1 rounded-sm border border-border px-2 py-1 text-xs">
          <Copy className="h-3 w-3" /> {copied ? 'Copied' : 'Copy'}
        </button>
        {c.deepLink && (
          <a
            href={c.deepLink}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 rounded-sm border border-border px-2 py-1 text-xs"
          >
            <ExternalLink className="h-3 w-3" /> Open
          </a>
        )}
      </div>
    </div>
  );
}

function TicketCard({ ticket }: { ticket: PredictorTicket }) {
  const codes = ticket.booking_codes ?? [];
  return (
    <div className="rounded-sm border border-border bg-card p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-[hsl(var(--seal))]" />
          <p className="font-serif font-semibold">Target odds ~{ticket.target_band}</p>
        </div>
        <span className="text-xs font-mono text-muted-foreground">
          {ticket.odds_basis === 'bookmaker' ? 'Odds' : 'Model odds'}: {ticket.combined_odds.toFixed(2)} &middot; Avg confidence:{' '}
          {Math.round(ticket.avg_confidence)}
        </span>
      </div>
      <div className="space-y-2">
        {ticket.selections.map((s, i) => (
          <div key={i} className="rounded-sm border border-border px-3.5 py-2.5">
            <div className="flex items-center justify-between">
              <p className="text-sm">
                {s.home_team} v {s.away_team}
                {s.competition && <span className="text-muted-foreground"> &middot; {s.competition}</span>}
              </p>
              <span className={`text-xs font-mono font-semibold ${scoreColor(s.score)}`}>{s.score}</span>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {s.market} &middot;{' '}
              {s.book_odds ? (
                <>
                  {s.book_name ?? 'Bookmaker'} <span className="font-mono">{Number(s.book_odds).toFixed(2)}</span>
                </>
              ) : (
                <>model odds {Number(s.model_odds).toFixed(2)}</>
              )}
              {s.model_probability ? <> &middot; model {Math.round(Number(s.model_probability) * 100)}%</> : null}
            </p>
            {s.reason && <p className="text-xs text-muted-foreground mt-1">{s.reason}</p>}
          </div>
        ))}
      </div>

      {codes.length > 0 && (
        <div className="mt-3 border-t border-border pt-2">
          <p className="text-[10px] font-mono uppercase tracking-wide text-muted-foreground">Ready-made booking codes</p>
          <div className="divide-y divide-border">
            {codes.map((c) => (
              <CodeRow key={c.slug} c={c} />
            ))}
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Created when the tickets were built. Prices on the platform may have moved since, so check the slip before you bet.
          </p>
        </div>
      )}
    </div>
  );
}

const TABS = [
  {
    key: 'bookmaker' as const,
    label: 'Bookmaker odds',
    blurb:
      'Games listed on SportyBet, with SportyBet\u2019s real prices when the tickets were built. They can change, so check the price on the platform before you bet.',
    empty: 'No bookmaker-odds tickets today. The bookmaker feed may have been unavailable, or no combination was confident enough.',
  },
  {
    key: 'model' as const,
    label: 'Model odds',
    blurb:
      'A wider set of games from our football data, including leagues bookmakers may list differently. Odds here are our model\u2019s implied fair odds (1 / estimated probability), so a platform\u2019s price will differ. Any booking code shows the platform\u2019s own odds.',
    empty: 'No model-odds tickets today. Today may have been too light a fixture day for a confident pick.',
  },
];

export function PredictorTickets({ tickets }: { tickets: PredictorTicket[] }) {
  const by = (basis: 'bookmaker' | 'model') =>
    tickets.filter((t) => (t.odds_basis ?? 'model') === basis).sort((a, b) => a.target_band - b.target_band);
  const sets = { bookmaker: by('bookmaker'), model: by('model') };
  const [tab, setTab] = useState<'bookmaker' | 'model'>(sets.bookmaker.length > 0 ? 'bookmaker' : 'model');
  const current = TABS.find((t) => t.key === tab)!;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className={`rounded-sm border px-3 py-2 text-sm ${
              tab === t.key ? 'border-[hsl(var(--ink))] bg-[hsl(var(--ink))] text-[hsl(var(--paper))]' : 'border-border'
            }`}
          >
            {t.label}
            <span className="ml-1.5 font-mono text-xs opacity-70">{sets[t.key].length}</span>
          </button>
        ))}
      </div>

      <p className="text-xs text-muted-foreground bg-muted/40 border border-border rounded-sm px-3 py-2">
        {current.blurb} Statistical analysis, not a guarantee.
      </p>

      {sets[tab].length === 0 ? (
        <div className="rounded-sm border border-dashed border-border bg-muted/40 p-5 text-sm text-muted-foreground">{current.empty}</div>
      ) : (
        sets[tab].map((ticket) => <TicketCard key={ticket.id} ticket={ticket} />)
      )}
    </div>
  );
}
