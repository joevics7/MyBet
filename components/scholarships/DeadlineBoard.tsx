import Link from 'next/link';
import { Clock3 } from 'lucide-react';

interface ScholarshipRow {
  slug: string;
  title: string;
  level: string | null;
  requirements_short: string | null;
  amount_short: string | null;
  deadline: string | null;
  countries?: { name: string; flag_emoji: string | null } | null;
}

function daysUntil(dateStr: string) {
  return Math.ceil((new Date(dateStr).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

function formatDeadline(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
}

/**
 * Styled after an airport/train departures board — dark board, mono digits,
 * flipping rows. Ties into Edubase's travel/seal visual motif: a scholarship
 * deadline reads like a boarding countdown, not a spreadsheet row.
 *
 * Deliberately terse: name, destination, a few-word requirement, a few-word
 * amount, and the closing date — enough to decide what to act on, nothing more.
 * Full detail lives on the individual scholarship page.
 */
export function DeadlineBoard({ scholarships }: { scholarships: ScholarshipRow[] }) {
  if (scholarships.length === 0) {
    return (
      <div className="rounded-sm border border-dashed border-border p-10 text-center bg-card">
        <p className="text-sm text-muted-foreground">
          The board is empty for now — scholarships are being researched and verified against
          official sources before they go live here.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-sm border border-[hsl(var(--ink))] bg-[hsl(var(--ink))] overflow-hidden shadow-lg">
      <div className="flex items-center justify-between px-5 py-3 border-b border-white/10">
        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[hsl(var(--paper))]/50">
          Scholarship &middot; Requires &middot; Closes
        </p>
        <span className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-wide text-[hsl(var(--seal))]">
          <span className="h-1.5 w-1.5 rounded-full bg-[hsl(var(--seal))] animate-pulse" />
          Live board
        </span>
      </div>
      <div className="divide-y divide-white/10">
        {scholarships.map((s) => {
          const days = s.deadline ? daysUntil(s.deadline) : null;
          return (
            <Link
              key={s.slug}
              href={`/scholarships/scholarship/${s.slug}`}
              className="flex items-center justify-between gap-4 px-5 py-3.5 hover:bg-white/5 transition-colors"
            >
              <div className="min-w-0">
                <p className="font-serif text-sm font-semibold text-[hsl(var(--paper))] truncate">
                  {s.title}
                </p>
                <p className="mt-0.5 font-mono text-[11px] text-[hsl(var(--paper))]/50 truncate">
                  {s.countries ? `${s.countries.flag_emoji} ${s.countries.name}` : 'Global'}
                  {s.requirements_short && ` · ${s.requirements_short}`}
                  {s.amount_short && ` · ${s.amount_short}`}
                </p>
              </div>
              <div className="shrink-0 flex flex-col items-end gap-1">
                {days !== null && days >= 0 && (
                  <div className="flex items-center gap-1.5 rounded-sm border border-[hsl(var(--seal))]/50 px-2.5 py-1">
                    <Clock3 className="h-3 w-3 text-[hsl(var(--seal))]" />
                    <span className="font-mono text-sm font-semibold text-[hsl(var(--seal))] tabular-nums">
                      {String(days).padStart(2, '0')}d
                    </span>
                  </div>
                )}
                {s.deadline && (
                  <span className="font-mono text-[10px] text-[hsl(var(--paper))]/40 tabular-nums">
                    {formatDeadline(s.deadline)}
                  </span>
                )}
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
