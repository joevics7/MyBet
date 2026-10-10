'use client';

import { useEffect, useState } from 'react';
import { Plus, Trash2, AlertTriangle } from 'lucide-react';
import {
  calculateKellyStake,
  combineSelections,
  confidenceScoreToProbability,
  type KellyResult,
} from '@/lib/stakeCalculator';

const BANKROLL_STORAGE_KEY = 'betmeter_bankroll';

interface SelectionRow {
  id: string;
  odds: string;       // kept as string while editing, parsed on compute
  confidence: string;
}

const KELLY_FRACTIONS = [
  { label: 'Quarter Kelly', value: 0.25 },
  { label: 'Half Kelly', value: 0.5 },
  { label: 'Full Kelly', value: 1 },
];

function newRow(): SelectionRow {
  return { id: crypto.randomUUID(), odds: '', confidence: '50' };
}

function ResultCard({ title, result }: { title: string; result: KellyResult }) {
  return (
    <div className="rounded-sm border border-border bg-card p-4">
      <p className="text-xs font-mono uppercase tracking-wide text-muted-foreground mb-2">{title}</p>

      {result.warning === 'negative_edge' && (
        <div className="flex items-start gap-2 mb-3 text-xs text-[hsl(var(--rust))] bg-[hsl(var(--rust))]/10 rounded-sm px-3 py-2">
          <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
          <span>This confidence level doesn&rsquo;t justify these odds. Consider skipping this bet.</span>
        </div>
      )}
      {result.warning === 'low_edge' && (
        <div className="flex items-start gap-2 mb-3 text-xs text-amber-700 bg-amber-500/10 rounded-sm px-3 py-2">
          <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
          <span>Positive but thin edge — the recommended stake is small on purpose.</span>
        </div>
      )}

      <p className="text-2xl font-serif font-semibold">
        ₦{result.recommendedStake.toLocaleString(undefined, { maximumFractionDigits: 0 })}
      </p>
      <p className="text-xs text-muted-foreground mt-1">
        {result.recommendedPercent.toFixed(1)}% of bankroll — estimated edge {result.edgePercent.toFixed(1)}%
      </p>
      {result.wasCapped && (
        <p className="text-[11px] text-muted-foreground mt-2">
          Capped at our 10% safety ceiling — the formula alone would suggest more, but we don&rsquo;t
          recommend staking above that regardless of confidence.
        </p>
      )}
    </div>
  );
}

export function StakeCalculatorForm() {
  const [bankroll, setBankroll] = useState('');
  const [kellyFraction, setKellyFraction] = useState(0.5); // default half Kelly, per spec
  const [selections, setSelections] = useState<SelectionRow[]>([newRow()]);

  // Bankroll memory. No auth/login flow exists yet, so this lives in
  // localStorage for now -- once Supabase Auth is wired, this should read
  // from / write to user_settings.bankroll instead so it follows the user
  // across devices.
  useEffect(() => {
    const saved = localStorage.getItem(BANKROLL_STORAGE_KEY);
    if (saved) setBankroll(saved);
  }, []);

  function updateBankroll(value: string) {
    setBankroll(value);
    if (value) localStorage.setItem(BANKROLL_STORAGE_KEY, value);
  }

  function updateRow(id: string, field: 'odds' | 'confidence', value: string) {
    setSelections((rows) => rows.map((r) => (r.id === id ? { ...r, [field]: value } : r)));
  }

  function addRow() {
    setSelections((rows) => [...rows, newRow()]);
  }

  function removeRow(id: string) {
    setSelections((rows) => (rows.length > 1 ? rows.filter((r) => r.id !== id) : rows));
  }

  const bankrollNum = parseFloat(bankroll) || 0;
  const validRows = selections
    .map((r) => ({ odds: parseFloat(r.odds), confidenceScore: parseFloat(r.confidence) }))
    .filter((r) => Number.isFinite(r.odds) && r.odds > 1 && Number.isFinite(r.confidenceScore));

  const canCompute = bankrollNum > 0 && validRows.length > 0;

  const perSelectionResults = canCompute
    ? validRows.map((r) =>
        calculateKellyStake({
          winProbability: confidenceScoreToProbability(r.confidenceScore),
          decimalOdds: r.odds,
          bankroll: bankrollNum,
          kellyFraction,
        }),
      )
    : [];

  const combinedResult =
    canCompute && validRows.length > 1
      ? (() => {
          const combined = combineSelections(validRows);
          return calculateKellyStake({
            winProbability: combined.probability,
            decimalOdds: combined.odds,
            bankroll: bankrollNum,
            kellyFraction,
          });
        })()
      : null;

  return (
    <div className="rounded-sm border border-border bg-card p-6 space-y-5">
      <div>
        <label htmlFor="bankroll" className="text-xs font-mono uppercase tracking-wide text-muted-foreground">
          Bankroll (₦)
        </label>
        <input
          id="bankroll"
          type="number"
          min="0"
          value={bankroll}
          onChange={(e) => updateBankroll(e.target.value)}
          placeholder="e.g. 50000"
          className="mt-1 w-full h-10 rounded-sm border border-border bg-background px-3 text-sm"
        />
      </div>

      <div>
        <p className="text-xs font-mono uppercase tracking-wide text-muted-foreground mb-1.5">
          Risk appetite
        </p>
        <div className="flex gap-2">
          {KELLY_FRACTIONS.map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => setKellyFraction(f.value)}
              className={`flex-1 h-9 rounded-sm text-xs font-semibold border transition-colors ${
                kellyFraction === f.value
                  ? 'bg-[hsl(var(--ink))] text-[hsl(var(--paper))] border-[hsl(var(--ink))]'
                  : 'border-border hover:border-[hsl(var(--seal))]'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="text-xs font-mono uppercase tracking-wide text-muted-foreground mb-1.5">
          Selections
        </p>
        <div className="space-y-2">
          {selections.map((row, i) => (
            <div key={row.id} className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground w-5 flex-shrink-0">{i + 1}.</span>
              <input
                type="number"
                step="0.01"
                min="1.01"
                value={row.odds}
                onChange={(e) => updateRow(row.id, 'odds', e.target.value)}
                placeholder="Odds e.g. 1.85"
                className="flex-1 min-w-0 h-9 rounded-sm border border-border bg-background px-2.5 text-sm"
              />
              <input
                type="number"
                min="0"
                max="100"
                value={row.confidence}
                onChange={(e) => updateRow(row.id, 'confidence', e.target.value)}
                placeholder="Confidence %"
                className="w-24 sm:w-28 min-w-0 shrink-0 h-9 rounded-sm border border-border bg-background px-2.5 text-sm"
              />
              <button
                type="button"
                onClick={() => removeRow(row.id)}
                disabled={selections.length === 1}
                className="h-9 w-9 flex items-center justify-center rounded-sm border border-border text-muted-foreground hover:text-[hsl(var(--rust))] hover:border-[hsl(var(--rust))] disabled:opacity-30 flex-shrink-0"
                aria-label="Remove selection"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={addRow}
          className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-[hsl(var(--verified))]"
        >
          <Plus className="h-3.5 w-3.5" /> Add selection
        </button>
        <p className="mt-2 text-[11px] text-muted-foreground">
          No confidence score from a decoded ticket yet? Enter your own win-probability estimate
          (0-100) instead — the calculator works the same either way.
        </p>
      </div>

      {!canCompute && (
        <p className="text-xs text-muted-foreground">
          Enter a bankroll and at least one selection (odds above 1.01) to see a recommendation.
        </p>
      )}

      {canCompute && (
        <div className="space-y-3 pt-1">
          {combinedResult && <ResultCard title="As one combined ticket" result={combinedResult} />}
          {perSelectionResults.map((result, i) => (
            <ResultCard
              key={i}
              title={
                validRows.length > 1
                  ? `Selection ${i + 1} — placed as its own bet`
                  : 'Recommended stake'
              }
              result={result}
            />
          ))}
        </div>
      )}
    </div>
  );
}
