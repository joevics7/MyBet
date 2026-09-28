import { CheckCircle2 } from 'lucide-react';

export interface ResultSlipRow {
  label: string;
  value: string;
  emphasis?: boolean;
}

interface ResultSlipProps {
  heading: string;
  rows: ResultSlipRow[];
  stampLabel?: string;
  note?: string;
}

/**
 * The Result Slip — Edubase's signature component.
 * Styled after an exam result / admission slip: ruled label/value rows in
 * monospace, a perforated divider, and a settling "stamp" badge.
 * Used for every calculator output, so the numeric answer always reads
 * as an official, trustworthy readout rather than plain text.
 */
export function ResultSlip({ heading, rows, stampLabel = 'Calculated', note }: ResultSlipProps) {
  return (
    <div className="relative rounded-sm border border-border bg-card shadow-sm overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-5 py-3 bg-[hsl(var(--ink))] text-[hsl(var(--paper))]">
        <p className="text-xs uppercase tracking-[0.14em] font-medium">{heading}</p>
        <span className="stamp-in flex items-center gap-1.5 rounded-full border border-[hsl(var(--seal))] px-2.5 py-1 text-[10px] uppercase tracking-wide text-[hsl(var(--seal))]">
          <CheckCircle2 className="h-3 w-3" strokeWidth={2.5} />
          {stampLabel}
        </span>
      </div>

      <div className="slip-perforation px-5">
        <dl className="divide-y divide-border">
          {rows.map((row) => (
            <div key={row.label} className="flex items-baseline justify-between gap-4 py-3">
              <dt className="text-sm text-muted-foreground">{row.label}</dt>
              <dd
                className={
                  row.emphasis
                    ? 'font-mono text-xl font-semibold text-[hsl(var(--verified))] tabular-nums'
                    : 'font-mono text-sm text-foreground tabular-nums'
                }
              >
                {row.value}
              </dd>
            </div>
          ))}
        </dl>
      </div>

      {note && (
        <p className="px-5 py-3 text-xs text-muted-foreground border-t border-border bg-muted/40">
          {note}
        </p>
      )}
    </div>
  );
}
