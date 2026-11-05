'use client';

import { useMemo, useState } from 'react';
import { Check, X, Clock, Minus, Copy, ExternalLink } from 'lucide-react';

export interface GameRow {
  id: string;
  game_date: string;
  home_team: string;
  away_team: string;
  competition: string | null;
  kickoff_at: string | null;
  market: string;
  confidence: number | string;
  odds: number | string | null;
  result: 'pending' | 'won' | 'lost' | 'void';
  final_score: string | null;
}

const PLATFORMS = [
  { slug: 'sportybet', label: 'SportyBet' },
  { slug: 'footballcom', label: 'Football.com' },
  { slug: 'msport', label: 'MSport' },
  { slug: 'bangbet', label: 'Bangbet' },
  { slug: 'paripesa', label: 'Paripesa' },
  { slug: 'melbet', label: 'Melbet' },
  { slug: 'helabet', label: 'Helabet' },
  { slug: 'betwinner', label: 'Betwinner' },
  { slug: 'afropari', label: 'Afropari' },
];
const MAX_PICKS = 20;

const level = (c: number) => (c >= 85 ? 'High' : c >= 75 ? 'Medium' : 'Lower');
const levelClass = (c: number) =>
  c >= 85 ? 'border-[hsl(var(--seal))] text-[hsl(var(--seal))]' : c >= 75 ? 'border-border text-foreground' : 'border-border text-muted-foreground';
const time = (iso: string | null) =>
  iso ? new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Lagos' }) : '';
const day = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });

function ResultIcon({ r }: { r: GameRow['result'] }) {
  if (r === 'won') return <Check className="h-4 w-4 text-green-600" aria-label="Won" />;
  if (r === 'lost') return <X className="h-4 w-4 text-red-600" aria-label="Lost" />;
  if (r === 'void') return <Minus className="h-4 w-4 text-muted-foreground" aria-label="Void" />;
  return <Clock className="h-4 w-4 text-muted-foreground" aria-label="Waiting" />;
}

function record(games: GameRow[]) {
  const won = games.filter((g) => g.result === 'won').length;
  const lost = games.filter((g) => g.result === 'lost').length;
  const pending = games.filter((g) => g.result === 'pending').length;
  const voided = games.filter((g) => g.result === 'void').length;
  const decided = won + lost;
  return { won, lost, pending, voided, pct: decided > 0 ? Math.round((won / decided) * 100) : null };
}

interface SlipResult { code: string; label: string; deepLink: string | null; totalOdds: number | null; used: number; skipped: { game: string; reason: string }[] }

export function PredictorGames({ todayDate, today, history }: { todayDate: string; today: GameRow[]; history: GameRow[] }) {
  const [tab, setTab] = useState<'today' | 'history'>('today');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [platform, setPlatform] = useState('sportybet');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [slip, setSlip] = useState<SlipResult | null>(null);
  const [copied, setCopied] = useState(false);

  const now = Date.now();
  const started = (g: GameRow) => !!g.kickoff_at && Date.parse(g.kickoff_at) <= now;
  const sorted = useMemo(() => [...today].sort((a, b) => Number(b.confidence) - Number(a.confidence)), [today]);

  const chosen = sorted.filter((g) => picked.has(g.id));
  const combined = chosen.reduce((p, g) => p * (Number(g.odds) || 1), 1);
  const avgConf = chosen.length ? chosen.reduce((s, g) => s + Number(g.confidence), 0) / chosen.length : 0;

  const toggle = (g: GameRow) => {
    if (started(g)) return;
    setSlip(null);
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(g.id)) next.delete(g.id);
      else if (next.size < MAX_PICKS) next.add(g.id);
      return next;
    });
  };

  async function create() {
    setBusy(true); setError(null); setSlip(null);
    try {
      const res = await fetch('/api/predictor/slip', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ platform, gameIds: Array.from(picked) }) });
      const json = await res.json();
      if (!res.ok) setError(json.error ?? 'Could not create a code.');
      else setSlip(json);
    } catch {
      setError('Network problem. Try again.');
    } finally {
      setBusy(false);
    }
  }

  const histDates = Array.from(new Set(history.map((g) => g.game_date))).sort().reverse();
  const all = record(history);

  return (
    <div className="pb-40">
      <div className="mb-4 flex gap-2 text-sm">
        {(['today', 'history'] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`rounded-sm border px-3 py-1.5 ${tab === t ? 'border-foreground font-medium' : 'border-border text-muted-foreground'}`}>
            {t === 'today' ? `Today (${sorted.length})` : 'Last 3 days'}
          </button>
        ))}
      </div>

      {tab === 'today' ? (
        sorted.length === 0 ? (
          <div className="rounded-sm border border-dashed border-border bg-muted/40 p-6 text-sm text-muted-foreground">
            <p className="font-medium text-foreground">No games analysed yet for {day(todayDate)}</p>
            <p className="mt-1.5">The Predictor runs each morning. Check back after it has run.</p>
          </div>
        ) : (
          <ul className="divide-y divide-border rounded-sm border border-border bg-card">
            {sorted.map((g) => {
              const c = Number(g.confidence);
              const isOn = picked.has(g.id);
              const gone = started(g);
              return (
                <li key={g.id}>
                  <button onClick={() => toggle(g)} disabled={gone} className={`flex w-full items-start gap-3 p-3 text-left ${isOn ? 'bg-muted/60' : ''} ${gone ? 'opacity-50' : ''}`}>
                    <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-sm border ${isOn ? 'border-foreground bg-foreground text-background' : 'border-border'}`}>
                      {isOn ? <Check className="h-3.5 w-3.5" /> : null}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium">{g.home_team} v {g.away_team}</span>
                      <span className="block text-xs text-muted-foreground">{time(g.kickoff_at)}{g.competition ? ` · ${g.competition}` : ''}{gone ? ' · started' : ''}</span>
                      <span className="mt-1 block text-sm">{g.market}{g.odds ? <span className="font-mono text-muted-foreground"> · {Number(g.odds).toFixed(2)}</span> : null}</span>
                    </span>
                    <span className={`shrink-0 rounded-sm border px-2 py-0.5 text-xs ${levelClass(c)}`}>{level(c)} {Math.round(c)}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {all.pct === null ? 'No results yet.' : <>Last 3 days: <strong className="text-foreground">{all.won} won, {all.lost} lost</strong> ({all.pct}%){all.pending ? ` · ${all.pending} waiting` : ''}{all.voided ? ` · ${all.voided} void` : ''}</>}
          </p>
          {histDates.length === 0 ? (
            <div className="rounded-sm border border-dashed border-border bg-muted/40 p-6 text-sm text-muted-foreground">No history yet. It builds up as each day&rsquo;s games finish.</div>
          ) : (
            histDates.map((d) => {
              const games = history.filter((g) => g.game_date === d).sort((a, b) => Number(b.confidence) - Number(a.confidence));
              const r = record(games);
              return (
                <div key={d} className="rounded-sm border border-border bg-card">
                  <div className="flex items-center justify-between border-b border-border px-3 py-2 text-sm">
                    <span className="font-medium">{day(d)}</span>
                    <span className="text-xs text-muted-foreground">{r.won}W {r.lost}L{r.pending ? ` ${r.pending} waiting` : ''}{r.pct !== null ? ` · ${r.pct}%` : ''}</span>
                  </div>
                  <ul className="divide-y divide-border">
                    {games.map((g) => (
                      <li key={g.id} className="flex items-center gap-3 px-3 py-2">
                        <ResultIcon r={g.result} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm">{g.home_team} v {g.away_team}</span>
                          <span className="block text-xs text-muted-foreground">{g.market} · {level(Number(g.confidence))} {Math.round(Number(g.confidence))}</span>
                        </span>
                        <span className="shrink-0 font-mono text-xs text-muted-foreground">{g.final_score ?? (g.result === 'void' ? 'void' : '')}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })
          )}
        </div>
      )}

      {tab === 'today' && (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-background p-3" style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
          <div className="mx-auto max-w-3xl space-y-2">
            {slip && (
              <div className="rounded-sm border border-border bg-card p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">{slip.label} · {slip.used} games{slip.totalOdds ? ` · odds ${Number(slip.totalOdds).toFixed(2)}` : ''}</p>
                    <p className="select-all font-mono text-base font-semibold tracking-wider">{slip.code}</p>
                  </div>
                  <div className="flex shrink-0 gap-1.5">
                    <button onClick={() => { navigator.clipboard?.writeText(slip.code); setCopied(true); setTimeout(() => setCopied(false), 1500); }} className="flex items-center gap-1 rounded-sm border border-border px-2 py-1 text-xs"><Copy className="h-3 w-3" /> {copied ? 'Copied' : 'Copy'}</button>
                    {slip.deepLink ? <a href={slip.deepLink} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 rounded-sm border border-border px-2 py-1 text-xs"><ExternalLink className="h-3 w-3" /> Open</a> : null}
                  </div>
                </div>
                {slip.skipped.length > 0 && <p className="mt-2 text-xs text-muted-foreground">Left out: {slip.skipped.map((s) => `${s.game} (${s.reason})`).join('; ')}</p>}
              </div>
            )}
            {error && <p className="text-xs text-red-600">{error}</p>}
            <div className="flex items-center gap-2">
              <p className="min-w-0 flex-1 text-xs text-muted-foreground">
                {chosen.length === 0 ? 'Tap games to build a slip' : <><strong className="text-foreground">{chosen.length}</strong> selected · odds <span className="font-mono">{combined.toFixed(2)}</span> · avg {Math.round(avgConf)}</>}
              </p>
              <select value={platform} onChange={(e) => { setPlatform(e.target.value); setSlip(null); }} className="rounded-sm border border-border bg-background px-2 py-1.5 text-sm">
                {PLATFORMS.map((p) => <option key={p.slug} value={p.slug}>{p.label}</option>)}
              </select>
              <button onClick={create} disabled={busy || chosen.length === 0} className="rounded-sm bg-foreground px-3 py-1.5 text-sm font-medium text-background disabled:opacity-40">{busy ? 'Creating…' : 'Create code'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
